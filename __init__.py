import hashlib
import time
import cv2
from PIL import Image
import numpy as np
import torch
from server import PromptServer, BinaryEventTypes

print("Loading ComfyUI-NDI nodes begin----------")
server = PromptServer.instance
import NDIlib as ndi
if not ndi.initialize():
    raise Exception("ndi canot init")

ndi_find=ndi.find_create_v2()
if ndi_find is None:
    raise Exception("can not init ndi find")

# need wait for ndi sources,anyway to start ndi find async?
time.sleep(2)
ndi.find_wait_for_sources(ndi_find, 1000)
ndi_sources = ndi.find_get_current_sources(ndi_find)

create_params = ndi.SendCreate()
create_params.clock_video = False
create_params.clock_audio = False
create_params.ndi_name = 'ComfyUI-NDI'

ndi_send = ndi.send_create(create_params)

print("Loading ComfyUI-NDI nodes end----------")
class NDISendImage:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"images": ("IMAGE",)}}
    
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "send_images2"
    CATEGORY = "NDI"

    def send_images2(self, images):
        print("NDI_send_images")
        results = []
        for image in images:
            array = 255.0 * image.cpu().numpy()
            
            show_image= Image.fromarray(np.clip(array, 0, 255).astype(np.uint8))
            
            png = cv2.cvtColor(array.astype(np.uint8), cv2.COLOR_RGB2RGBA)
            
            video_frame = ndi.VideoFrameV2()

            video_frame.data = png
            video_frame.FourCC = ndi.FOURCC_VIDEO_TYPE_RGBX
            
            ndi.send_send_video_v2(ndi_send, video_frame)
            
            server = PromptServer.instance
            
            server.send_sync(
                BinaryEventTypes.UNENCODED_PREVIEW_IMAGE,
                ["PNG",show_image , None],
                server.client_id,
            )
            
            results.append(
                # Could put some kind of ID here, but for now just match them by index
                {"source": "ndi", "content-type": "image/png", "type": "output"}
            )
        return {"ui": {"images": results}}

class NDIReceiveImage:
    @classmethod
    def INPUT_TYPES(self):
        print("INPUT_TYPES")
        list=[x.ndi_name for x in ndi_sources]
        return {"required": {"ndi_name":(list,{"default":None})}}

    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "receive_images"
    CATEGORY = "NDI"
    
    ndi_find=None
    ndi_framesync=None
    
    cur_ndi_name=None
   
    def receive_images(self,ndi_name):
        
        print("source_name:",ndi_name)
        
        if self.ndi_framesync is None or self.cur_ndi_name!=ndi_name:
            if self.ndi_framesync is not None:
                print("ndi_framesync_destoroy")
                ndi.framesync_destroy(self.ndi_framesync)
                ndi.recv_destroy(self.ndi_recv)
            self.ndi_recv = ndi.recv_create_v3()
            if self.ndi_recv is None:
                raise Exception("can not init ndi recv")
            
            findindices = [i for i, x in enumerate(ndi_sources) if x.ndi_name == ndi_name]
                                
            
            if len(findindices)==0:
                raise Exception("can not find ndi source")
                
                
            ndi.recv_connect(self.ndi_recv, ndi_sources[findindices[0]])
            self.ndi_framesync = ndi.framesync_create(self.ndi_recv)
            self.cur_ndi_name=ndi_name
                
        x=0
        while x==0:
            v = ndi.framesync_capture_video(self.ndi_framesync)
            x=v.xres
            time.sleep(0.1)
        
        rgba =  cv2.cvtColor(v.data, cv2.COLOR_YUV2RGBA_Y422)

        img= Image.fromarray(rgba)
        img = img.convert("RGB")
        img = np.array(img).astype(np.float32) / 255.0
        img = torch.from_numpy(img)[None,]
        # ndi source always have alpha channel
        mask = np.array(img.getchannel("A")).astype(np.float32) / 255.0
        mask = 1.0 - torch.from_numpy(mask)
        ndi.framesync_free_video(self.ndi_framesync, v)
        
        return (img,mask)
    def IS_CHANGED(self):
        print("IS_CHANGED")
        m = hashlib.sha256()
        m.update(str(time.time()).encode())
        
        return m.digest().hex()
    def __del__(self):
        ndi.framesync_destroy(self.ndi_framesync)
        ndi.recv_destroy(self.ndi_recv)

        
    def __init__(self):
        # make ndi
        print("NDIReceiveImage __init__")
        
NODE_CLASS_MAPPINGS = {
    "NDI_LoadImage": NDIReceiveImage,
    "NDI_SendImage": NDISendImage,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "NDI_LoadImage": "NDI Receive Image",
    "NDI_SendImage": "NDI Send Image",
}