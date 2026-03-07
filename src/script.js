/**
 * Western Windows Landing Page - JavaScript
 * Handles navigation, animations, and form interactions
 */

document.addEventListener('DOMContentLoaded', function () {
    // ===== NAVIGATION =====
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    // Scroll-based navbar styling
    function handleNavbarScroll() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', handleNavbarScroll);
    handleNavbarScroll(); // Initial check

    // Mobile menu toggle
    navToggle.addEventListener('click', function () {
        const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
        navToggle.setAttribute('aria-expanded', !isExpanded);
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    // Close mobile menu when clicking nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });

    // ===== SMOOTH SCROLL =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // ===== STAT COUNTER ANIMATION =====
    const stats = document.querySelectorAll('.stat-number');
    let statsAnimated = false;

    function animateStats() {
        stats.forEach(stat => {
            const target = parseInt(stat.getAttribute('data-target'));
            const duration = 2000;
            const increment = target / (duration / 16);
            let current = 0;

            const updateCounter = () => {
                current += increment;
                if (current < target) {
                    stat.textContent = Math.floor(current).toLocaleString();
                    requestAnimationFrame(updateCounter);
                } else {
                    stat.textContent = target.toLocaleString();
                }
            };

            updateCounter();
        });
    }

    // Trigger stat animation when hero section is in view
    const heroSection = document.getElementById('home');
    const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !statsAnimated) {
                statsAnimated = true;
                animateStats();
            }
        });
    }, { threshold: 0.5 });

    if (heroSection) {
        heroObserver.observe(heroSection);
    }

    // ===== TESTIMONIAL SLIDER =====
    const testimonialTrack = document.getElementById('testimonialTrack');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const dotsContainer = document.getElementById('testimonialDots');

    if (testimonialTrack && prevBtn && nextBtn && dotsContainer) {
        const cards = testimonialTrack.querySelectorAll('.testimonial-card');
        let currentIndex = 0;
        let cardsPerView = getCardsPerView();

        function getCardsPerView() {
            if (window.innerWidth <= 768) return 1;
            if (window.innerWidth <= 1024) return 2;
            return 3;
        }

        // Create dots
        function createDots() {
            dotsContainer.innerHTML = '';
            const totalDots = Math.ceil(cards.length / cardsPerView);
            for (let i = 0; i < totalDots; i++) {
                const dot = document.createElement('button');
                dot.classList.add('dot');
                dot.setAttribute('role', 'tab');
                dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
                if (i === 0) dot.classList.add('active');
                dot.addEventListener('click', () => goToSlide(i));
                dotsContainer.appendChild(dot);
            }
        }

        function updateDots() {
            const dots = dotsContainer.querySelectorAll('.dot');
            dots.forEach((dot, index) => {
                dot.classList.toggle('active', index === currentIndex);
            });
        }

        function updateSlider() {
            const cardWidth = cards[0].offsetWidth + 32; // Including gap
            testimonialTrack.style.transform = `translateX(-${currentIndex * cardWidth * cardsPerView}px)`;
            updateDots();
        }

        function goToSlide(index) {
            const maxIndex = Math.ceil(cards.length / cardsPerView) - 1;
            currentIndex = Math.max(0, Math.min(index, maxIndex));
            updateSlider();
        }

        prevBtn.addEventListener('click', () => {
            goToSlide(currentIndex - 1);
        });

        nextBtn.addEventListener('click', () => {
            goToSlide(currentIndex + 1);
        });

        // Handle resize
        window.addEventListener('resize', () => {
            const newCardsPerView = getCardsPerView();
            if (newCardsPerView !== cardsPerView) {
                cardsPerView = newCardsPerView;
                currentIndex = 0;
                createDots();
                updateSlider();
            }
        });

        createDots();

        // Auto-play (optional - every 5 seconds)
        setInterval(() => {
            const maxIndex = Math.ceil(cards.length / cardsPerView) - 1;
            goToSlide(currentIndex >= maxIndex ? 0 : currentIndex + 1);
        }, 5000);
    }

    // ===== SCROLL ANIMATIONS =====
    const animatedElements = document.querySelectorAll('.service-card, .benefit-item, .gallery-item, .testimonial-card');

    const scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        scrollObserver.observe(el);
    });

    // ===== CONTACT FORM - GOOGLE FORMS INTEGRATION =====
    const contactForm = document.getElementById('contactForm');

    if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
            // Get form field values using the Google Forms entry names
            const nameField = contactForm.querySelector('[name="entry.202503320"]');
            const emailField = contactForm.querySelector('[name="entry.978868908"]');
            const phoneField = contactForm.querySelector('[name="entry.650176977"]');
            const addressField = contactForm.querySelector('[name="entry.246840981"]');
            const serviceField = contactForm.querySelector('[name="entry.1152671567"]');
            const messageField = contactForm.querySelector('[name="message_display"]');
            const messageWithSourceField = document.getElementById('messageWithSource');

            // Simple validation
            if (!nameField.value || !emailField.value || !phoneField.value || !addressField.value || !serviceField.value) {
                e.preventDefault();
                alert('Please fill in all required fields.');
                return;
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(emailField.value)) {
                e.preventDefault();
                alert('Please enter a valid email address.');
                return;
            }

            // Phone validation (basic)
            const phoneRegex = /^[\d\s\-\(\)\+\.]+$/;
            if (!phoneRegex.test(phoneField.value) || phoneField.value.replace(/\D/g, '').length < 10) {
                e.preventDefault();
                alert('Please enter a valid phone number.');
                return;
            }

            // Prepend source identifier to message
            const userMessage = messageField.value || '(No additional message)';
            messageWithSourceField.value = '[WESTERN WINDOWS] ' + userMessage;

            // Show success UI immediately (form submits to hidden iframe)
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            submitBtn.innerHTML = '<span>Sending...</span>';
            submitBtn.disabled = true;

            // Show success after a short delay
            setTimeout(() => {
                submitBtn.innerHTML = '<span>✓ Message Sent!</span>';
                submitBtn.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';

                // Reset form
                contactForm.reset();

                // Reset button after 3 seconds
                setTimeout(() => {
                    submitBtn.innerHTML = originalText;
                    submitBtn.style.background = '';
                    submitBtn.disabled = false;
                }, 3000);
            }, 1000);
        });
    }

    // ===== SKIP LINK FOCUS STYLING =====
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
        skipLink.addEventListener('focus', function () {
            this.style.top = '0';
        });
        skipLink.addEventListener('blur', function () {
            this.style.top = '-40px';
        });
    }

    // ===== GALLERY HOVER EFFECTS (Touch devices) =====
    const galleryItems = document.querySelectorAll('.gallery-item');

    galleryItems.forEach(item => {
        item.addEventListener('touchstart', function () {
            this.querySelector('.gallery-overlay').style.opacity = '1';
        });

        item.addEventListener('touchend', function () {
            setTimeout(() => {
                this.querySelector('.gallery-overlay').style.opacity = '';
            }, 1000);
        });
    });

    console.log('Western Windows Landing Page initialized successfully!');
});
