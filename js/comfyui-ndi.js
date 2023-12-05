import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
  name: "Comfy.NDIMenu",
  init() {},
  async setup() {
    const menu = document.querySelector(".comfy-menu");
    const separator = document.createElement("hr");

    separator.style.margin = "20px 0";
    separator.style.width = "100%";
    menu.append(separator);

    const updateBtn = document.createElement("button");
    updateBtn.textContent = "Update NDI list";
    updateBtn.onclick = () => {
      api.fetchApi("/ndi/update_list");
    };

    menu.append(updateBtn);
  },
});
