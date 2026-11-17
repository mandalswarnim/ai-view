import { adapters } from "@aiview/adapters";
import { createRoot, type Root } from "react-dom/client";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";
import { Panel } from "./Panel";
import "./style.css";

export default defineContentScript({
  // Listing pages only. Zoopla and OnTheMarket are added with their adapters in phase 2.
  matches: ["https://www.rightmove.co.uk/properties/*"],
  // The panel's CSS goes inside its shadow root, so neither side can restyle the other.
  cssInjectionMode: "ui",

  async main(ctx) {
    const adapter = adapters.find((candidate) => candidate.matches(location.href));
    if (adapter === undefined) return;

    const ui = await createShadowRootUi<Root>(ctx, {
      name: "aiview-panel",
      position: "inline",
      anchor: "body",
      append: "last",
      onMount(container) {
        const root = createRoot(container);
        root.render(<Panel adapter={adapter} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
