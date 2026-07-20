function analyze() {

  const result = document.getElementById("result");

  result.innerHTML = `
    <p><strong>Hệ thống hoạt động bình thường.</strong></p>
    <p>Chưa kết nối cơ sở dữ liệu XSMB.</p>
  `;

}

if ("serviceWorker" in navigator) {

  window.addEventListener("load", () => {

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        console.log("Service Worker registered");
      })
      .catch(error => {
        console.error(error);
      });

  });

}
