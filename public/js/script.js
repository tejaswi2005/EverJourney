// // Navbar scroll effect
// window.addEventListener("scroll", () => {
//   const navbar = document.querySelector(".navbar");
//   if (window.scrollY > 50) {
//     navbar.classList.add("scrolled");
//   } else {
//     navbar.classList.remove("scrolled");
//   }
// });

// // Example: Show alert on search form submission
// document.addEventListener("DOMContentLoaded", () => {
//   const forms = document.querySelectorAll("form");
//   forms.forEach(form => {
//     form.addEventListener("submit", e => {
//       e.preventDefault();
//       alert("Search functionality coming soon 🚀");
//     });
//   });
// });


document.getElementById('travel-tab').addEventListener('click', function() {
    this.classList.add('active');
    document.getElementById('stay-tab').classList.remove('active');
    document.getElementById('travel-form').style.display = 'block';
    document.getElementById('stay-form').style.display = 'none';
});

document.getElementById('stay-tab').addEventListener('click', function() {
    this.classList.add('active');
    document.getElementById('travel-tab').classList.remove('active');
    document.getElementById('stay-form').style.display = 'block';
    document.getElementById('travel-form').style.display = 'none';
});

document.querySelectorAll('input[type="date"]').forEach(input => {
    input.min = new Date().toISOString().split('T')[0];
});
