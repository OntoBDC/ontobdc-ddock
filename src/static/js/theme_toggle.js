document.addEventListener('DOMContentLoaded', function() {
    // Jazzmin uses AdminLTE 3 which puts the navbar menu on the right in `.main-header .navbar-nav`
    // We look for the last navbar-nav which is usually the right one.
    const navbars = document.querySelectorAll('.main-header .navbar-nav');
    const rightNavbar = navbars[navbars.length - 1];

    if (rightNavbar) {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `
            <a class="nav-link" id="theme-toggle" href="#" role="button" title="Toggle Dark Mode">
                <i class="fas fa-moon"></i>
            </a>
        `;
        // Insert before the language chooser or at the beginning of the right navbar
        rightNavbar.insertBefore(li, rightNavbar.firstChild);

        const themeToggle = document.getElementById('theme-toggle');
        const body = document.body;
        const icon = themeToggle.querySelector('i');
        const navbar = document.querySelector('.main-header');
        const sidebar = document.querySelector('.main-sidebar');

        // Check localStorage for user preference
        const isDarkMode = localStorage.getItem('isDarkMode') === 'true';
        
        const applyTheme = (dark) => {
            if (dark) {
                body.classList.add('dark-mode');
                icon.classList.replace('fa-moon', 'fa-sun');
                if(navbar) {
                    navbar.classList.remove('navbar-white', 'navbar-light');
                    navbar.classList.add('navbar-dark');
                }
            } else {
                body.classList.remove('dark-mode');
                icon.classList.replace('fa-sun', 'fa-moon');
                if(navbar) {
                    navbar.classList.remove('navbar-dark');
                    navbar.classList.add('navbar-white', 'navbar-light');
                }
            }
        };

        // Apply initially
        applyTheme(isDarkMode);

        themeToggle.addEventListener('click', function(e) {
            e.preventDefault();
            const currentlyDark = body.classList.contains('dark-mode');
            const newDark = !currentlyDark;
            
            localStorage.setItem('isDarkMode', newDark);
            applyTheme(newDark);
        });
    }
});