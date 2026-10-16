// Picks Lunch or Drinks before the page paints, so the theme never flashes.
// #lunch / #drinks in the link wins, then this visit's choice, then the clock in Boston.
(function () {
  var tab = location.hash.slice(1);
  if (tab !== "lunch" && tab !== "drinks") {
    try {
      tab = sessionStorage.getItem("wheel.tab");
    } catch (e) {}
  }
  if (tab !== "lunch" && tab !== "drinks") {
    var hour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()), 10);
    tab = hour >= 10 && hour < 15 ? "lunch" : "drinks";
  }
  document.documentElement.setAttribute("data-tab", tab);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tab === "lunch" ? "#efe5d4" : "#0b0c14");
})();
