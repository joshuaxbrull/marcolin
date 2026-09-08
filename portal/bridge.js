import { managerDestination } from "./destination.js";
try {
  const response = await fetch(`./config.json?fresh=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error();
  const url = managerDestination((await response.json()).managerOrigin);
  if (!url) throw new Error();
  const link = document.getElementById("manager");
  link.href = url; link.hidden = false;
  // Do not forward passwords, OAuth codes, or hashes from the retired portal.
  location.replace(url);
} catch {
  document.getElementById("status").textContent = "Manager sign-in is being upgraded. Please contact the site owner to finish activation.";
}
