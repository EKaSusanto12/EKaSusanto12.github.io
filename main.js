var audio= document.getElementsByTagName("audio");
var navActive= document.getElementsByClassName("active");
if (navActive) {
 audio.style.display = "none";
} else {
 audio.style.display = "block";
}