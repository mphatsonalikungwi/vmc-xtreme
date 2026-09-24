import "./config.js";

const initSiteMenu=()=>{
  const menuButton=document.querySelector("[data-site-menu-toggle]");
  const navShell=document.querySelector("[data-site-nav-shell]");
  if(!menuButton||!navShell)return;
  const close=()=>{
    navShell.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded","false");
    menuButton.setAttribute("aria-label","Open navigation");
  };
  const toggle=()=>{
    const open=!navShell.classList.contains("is-open");
    navShell.classList.toggle("is-open",open);
    menuButton.setAttribute("aria-expanded",String(open));
    menuButton.setAttribute("aria-label",open?"Close navigation":"Open navigation");
  };
  menuButton.addEventListener("click",toggle);
  navShell.querySelectorAll("a").forEach(link=>link.addEventListener("click",close));
  document.addEventListener("click",(event)=>{
    if(window.innerWidth<=767 && navShell.classList.contains("is-open") &&
      !navShell.contains(event.target) && !menuButton.contains(event.target)) close();
  });
  document.addEventListener("keydown",(event)=>{if(event.key==="Escape")close();});
  window.addEventListener("resize",()=>{if(window.innerWidth>767)close();});
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initSiteMenu);
else initSiteMenu();
document.documentElement.dataset.vmcReady="true";
