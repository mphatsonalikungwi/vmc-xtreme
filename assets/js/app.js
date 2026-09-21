import { VMC_CONFIG } from "./config.js";

document.documentElement.dataset.vmcReady = "true";

const telLink = document.querySelector('a[href^="tel:"]');
if (telLink) telLink.setAttribute("aria-label", `Call VMC Xtreme Fitness at ${VMC_CONFIG.gym.phone}`);