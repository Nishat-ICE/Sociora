(function () {

    const savedTheme =
        localStorage.getItem("sociora-theme");

    if (savedTheme === "dark") {

        document.documentElement.classList.add(
            "dark"
        );

    }

})();


function toggleTheme() {

    const isDark =
        document.documentElement.classList.toggle(
            "dark"
        );

    document.body.classList.toggle(
        "dark",
        isDark
    );

    localStorage.setItem(
        "sociora-theme",
        isDark
            ? "dark"
            : "light"
    );

    updateThemeButtons();

}


function loadTheme() {

    const isDark =
        localStorage.getItem(
            "sociora-theme"
        ) === "dark";


    document.documentElement.classList.toggle(
        "dark",
        isDark
    );


    if (document.body) {

        document.body.classList.toggle(
            "dark",
            isDark
        );

    }


    updateThemeButtons();

}


function updateThemeButtons() {

    const isDark =
        document.documentElement.classList.contains(
            "dark"
        );


    document
        .querySelectorAll(
            ".theme-btn"
        )
        .forEach(
            function (button) {

                button.innerHTML =
                    isDark
                        ? "☀ Light"
                        : "◐ Dark";

            }
        );

}


document.addEventListener(
    "DOMContentLoaded",
    loadTheme
);