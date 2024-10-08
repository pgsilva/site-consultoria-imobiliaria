function scrollToSection(id) {
    const section = document.getElementById(id);
    const headerHeight = document.getElementById('header').offsetHeight; // Substitua pelo seletor do seu header
    const elementPosition = section.offsetTop - headerHeight;
    window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
    });
}