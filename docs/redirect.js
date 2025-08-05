if (document.location.host === "w3c.github.io") {
  const slash =document.location.pathname.lastIndexOf('/');
  // redirect
  document.location.href= "https://www.w3.org/PM/horizontal"
    + document.location.pathname.substring(slash)
    + document.location.search;
}

