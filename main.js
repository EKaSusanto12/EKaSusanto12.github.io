var audio = document.getElementsByTagName("audio")[0]; // Mengambil elemen pertama dengan tag "audio"
var navActive = document.getElementsByClassName("active");

if (audio && navActive.length > 0) { // Memeriksa apakah elemen audio dan elemen dengan kelas "active" ada
  audio.style.display = "none"; // Menyembunyikan elemen audio
} else if (audio) {
  audio.style.display = "block"; // Menampilkan elemen audio jika elemen dengan kelas "active" tidak ada
}
