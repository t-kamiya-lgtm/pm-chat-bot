(function () {
  // チャットボット決済システム 埋め込みスニペット
  // スマレジEC・リピートの「デザインPC/デザインSP」等にこのスクリプトタグを1行追加するだけで、
  // ポップアップ型のチャットウィジェットが表示される。
  // 例: <script src="https://<デプロイ先ドメイン>/widget.js" data-widget-origin="https://<デプロイ先ドメイン>"></script>

  var currentScript = document.currentScript;
  var origin =
    (currentScript && currentScript.getAttribute("data-widget-origin")) ||
    new URL(currentScript.src).origin;

  var button = document.createElement("button");
  button.textContent = "チャットで相談する";
  button.setAttribute("aria-label", "チャットボットを開く");
  Object.assign(button.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483000",
    padding: "12px 20px",
    borderRadius: "999px",
    border: "none",
    background: "#171717",
    color: "#fff",
    fontSize: "14px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  });

  var container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    right: "20px",
    bottom: "80px",
    width: "380px",
    maxWidth: "92vw",
    height: "600px",
    maxHeight: "80vh",
    zIndex: "2147483000",
    display: "none",
    borderRadius: "16px",
    overflow: "hidden",
    boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
  });

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/widget";
  Object.assign(iframe.style, { width: "100%", height: "100%", border: "none" });
  container.appendChild(iframe);

  var isOpen = false;
  button.addEventListener("click", function () {
    isOpen = !isOpen;
    container.style.display = isOpen ? "block" : "none";
    button.textContent = isOpen ? "閉じる" : "チャットで相談する";
  });

  document.body.appendChild(container);
  document.body.appendChild(button);
})();
