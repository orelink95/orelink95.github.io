function toggleModal() {
    const modal = document.getElementById('not-see-modal');
    modal.classList.toggle('hidden');
}


// Function to fetch and inject HTML
function loadComponent(placeholderId, componentPath) {
    const placeholder = document.getElementById(placeholderId);

    if (!placeholder) return;

    fetch(componentPath)
        .then(response => {
            if (!response.ok) throw new Error(`Could not load ${componentPath}`);
            return response.text();
        })
        .then(htmlData => {
            // Inject the HTML
            placeholder.innerHTML = htmlData;

            // If the component we just injected is the header, run the header highlight function
            if (placeholderId === "header-placeholder") {
                highlightActiveLink();
            }
            // NEW: If the component we just injected is the sidebar, run the sidebar highlight function
            else if (placeholderId === "sidebar-placeholder") {
                highlightActiveSidebarItem();
            }
        })
        .catch(error => console.error(error));
}

// Function to find and highlight the active page in the header nav
function highlightActiveLink() {
    // 1. Get the current file name (e.g., 'world.html' or 'index.html')
    let currentFileName = window.location.pathname.split("/").pop();

    // If the URL ends in a slash (like on a live server root), default to index.html
    if (currentFileName === "") currentFileName = "index.html";

    // 2. Find all the navigation links inside the header
    const navLinks = document.querySelectorAll("#header-placeholder a.nav-item");

    // 3. Loop through them and check if they match the current page
    navLinks.forEach(link => {
        const linkHref = link.getAttribute("href");

        if (linkHref === currentFileName) {
            // Remove the default dull text color
            link.classList.remove("text-[#e2e3df]");

            // Add the glowing gold active colors
            link.classList.add("text-[#e9c176]", "drop-shadow-[0_0_8px_rgba(233,193,118,0.4)]");

            // Optional: Find the icon inside this link and make it permanently tilted and gold
            const icon = link.querySelector(".material-symbols-outlined");
            if (icon) {
                icon.classList.add("rotate-12", "text-[#e9c176]");
            }
        }
    });
}

// NEW: Function to find and highlight the active page in the sidebar nav
function highlightActiveSidebarItem() {
    let currentPath = window.location.pathname.split("/").pop();
    if (currentPath === "") currentPath = "index.html";

    const navItems = document.querySelectorAll('#atlas-sidebar .nav-item');

    navItems.forEach(item => {
        const itemHref = item.getAttribute('href');

        if (itemHref === currentPath) {
            // Remove the inactive classes
            item.classList.remove('text-on-surface', 'hover:text-secondary', 'hover:bg-surface-container-high');

            // Add the golden active classes
            item.classList.add('text-secondary', 'bg-surface-container-highest', 'shadow-inner', 'hover:bg-surface-bright', 'relative');
        }
    });
}

// Function to handle the Mobile Sidebar toggle
function toggleMobileSidebar() {
    const sidebar = document.getElementById('atlas-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (!sidebar || !backdrop) return;

    // Check if it's currently hidden off-screen
    if (sidebar.classList.contains('-translate-x-full')) {
        // Slide it in
        sidebar.classList.remove('-translate-x-full');
        // Show the dark background
        backdrop.classList.remove('hidden');
        // Tiny delay to allow the 'hidden' class removal to register before fading in
        setTimeout(() => backdrop.classList.remove('opacity-0'), 10);
    } else {
        // Slide it out
        sidebar.classList.add('-translate-x-full');
        // Fade out the dark background
        backdrop.classList.add('opacity-0');
        // Wait for the fade animation to finish before hiding completely
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    }
}

// Start the fetch process when the page loads
document.addEventListener("DOMContentLoaded", () => {
    loadComponent("header-placeholder", "components/header.html");
    loadComponent("footer-placeholder", "components/footer.html");
    loadComponent("sidebar-placeholder", "components/sidebar.html");
});