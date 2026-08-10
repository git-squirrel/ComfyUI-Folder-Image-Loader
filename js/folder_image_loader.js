/**
 * 📁 文件夹图片加载器 - 前端扩展（重写版）
 *
 * 关键原理：
 * - ComfyUI DOM widget 高度由 getMinHeight/getMaxHeight 控制，CSS min-height 无效
 * - 不调 setSize/computeSize，避免无限拉伸
 * - 扫描按钮直接调 API，不需要 confirm_scan 参数
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "comfyui-folder-image-loader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SequentialFolderImageLoader") {

            nodeType.prototype.onNodeCreated = function () {
                this._addInfoPanel();
                this._addScanButton();
            };

            // ---- 信息面板（高度由 getMinHeight 控制，不是 CSS） ----
            nodeType.prototype._addInfoPanel = function () {
                const panel = document.createElement("div");
                panel.style.cssText = `
                    padding: 16px 18px;
                    box-sizing: border-box;
                    background: rgba(15, 15, 15, 0.95);
                    border: 1px solid rgba(80, 80, 80, 0.3);
                    border-radius: 10px;
                    font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
                    overflow: hidden;
                `;
                panel.innerHTML = '<div style="text-align:center; padding:80px 0; color:#555; font-size:14px;">点击下方按钮扫描文件夹...</div>';

                const w = this.addDOMWidget("info_panel", "div", panel, {
                    serialize: false,
                    getMinHeight: () => 280,
                    getMaxHeight: () => 280,
                });
                if (w) w.serialize = false;

                this._infoPanel = panel;
            };

            // ---- 确认扫描按钮 ----
            nodeType.prototype._addScanButton = function () {
                const container = document.createElement("div");
                container.style.cssText = "padding: 0 8px;";

                const btn = document.createElement("button");
                btn.textContent = "🔍 确认扫描";
                btn.style.cssText = `
                    width: 100%; padding: 12px 14px;
                    background: linear-gradient(135deg, #2196F3, #1976D2);
                    color: white; border: none; border-radius: 8px;
                    cursor: pointer; font-size: 17px; font-weight: bold;
                    transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                `;
                btn.onmouseenter = () => { if (!btn.disabled) { btn.style.background = "linear-gradient(135deg, #1976D2, #1565C0)"; } };
                btn.onmouseleave = () => { btn.style.background = "linear-gradient(135deg, #2196F3, #1976D2)"; };

                btn.onclick = async () => {
                    const folderWidget = this.widgets.find(w => w.name === "folder_path");
                    const folderPath = folderWidget ? folderWidget.value : "";
                    btn.textContent = "⏳ 扫描中...";
                    btn.disabled = true;
                    btn.style.background = "linear-gradient(135deg, #FF9800, #F57C00)";
                    try {
                        await api.fetchApi("/folder-loader-scan", {
                            method: "POST",
                            body: JSON.stringify({ folder_path: folderPath }),
                            headers: { "Content-Type": "application/json" }
                        });
                    } catch (e) { console.error("[文件夹加载器] 扫描失败:", e); }
                    setTimeout(() => {
                        btn.textContent = "🔍 确认扫描";
                        btn.disabled = false;
                        btn.style.background = "linear-gradient(135deg, #2196F3, #1976D2)";
                    }, 1200);
                };
                container.appendChild(btn);
                this.addDOMWidget("scan_button", "button", container, { serialize: false });
            };

            // ---- 更新面板内容（只改 innerHTML，不调 setSize） ----
            nodeType.prototype._updateInfoPanel = function (infoStr) {
                if (!this._infoPanel || !infoStr) return;
                const p = infoStr.split("|");
                let html = "";

                if (p[0] === "scan") {
                    const total = parseInt(p[1]) || 0;
                    const loaded = parseInt(p[2]) || 0;
                    const remaining = parseInt(p[3]) || 0;
                    const path = p.slice(4).join("|");
                    const pct = total > 0 ? (loaded / total * 100).toFixed(1) : 0;
                    html = `
                        <div style="color:#4CAF50;font-weight:bold;margin-bottom:10px;font-size:20px;">📂 扫描结果</div>
                        <div style="display:flex;justify-content:space-between;margin:5px 0;font-size:19px;"><span>🖼️ 图片总数</span><b style="color:#fff;font-size:20px;">${total}</b></div>
                        <div style="display:flex;justify-content:space-between;margin:5px 0;font-size:19px;"><span>✅ 已加载</span><b style="color:#4CAF50;font-size:20px;">${loaded}</b></div>
                        <div style="display:flex;justify-content:space-between;margin:5px 0;font-size:19px;"><span>⏳ 剩余</span><b style="color:#FF9800;font-size:20px;">${remaining}</b></div>
                        <div style="margin-top:12px;background:#2a2a2a;border-radius:6px;height:12px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#4CAF50,#8BC34A);"></div></div>
                        <div style="color:#777;font-size:12px;margin-top:10px;word-break:break-all;">📁 ${path}</div>
                    `;
                } else if (p[0] === "load") {
                    const total = parseInt(p[1]) || 0;
                    const idx = parseInt(p[2]) || 0;
                    const loaded = parseInt(p[3]) || 0;
                    const remaining = parseInt(p[4]) || 0;
                    const fname = p[5] || "";
                    const pct = total > 0 ? ((idx + 1) / total * 100).toFixed(1) : 0;
                    html = `
                        <div style="color:#2196F3;font-weight:bold;margin-bottom:10px;font-size:20px;">✅ 当前进度</div>
                        <div style="display:flex;justify-content:space-between;margin:5px 0;font-size:19px;"><span>📊 进度</span><b style="color:#fff;font-size:20px;">${idx + 1} / ${total}</b></div>
                        <div style="display:flex;justify-content:space-between;margin:5px 0;font-size:19px;"><span>✅ 已加载</span><b style="color:#4CAF50;font-size:20px;">${loaded}</b></div>
                        <div style="display:flex;justify-content:space-between;margin:5px 0;font-size:19px;"><span>⏳ 剩余</span><b style="color:#FF9800;font-size:20px;">${remaining}</b></div>
                        <div style="margin-top:12px;background:#2a2a2a;border-radius:6px;height:12px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#2196F3,#03A9F4);"></div></div>
                        <div style="color:#888;font-size:12px;margin-top:10px;word-break:break-all;">📄 ${fname}</div>
                    `;
                }

                if (html) {
                    this._infoPanel.innerHTML = html;
                    this._infoPanel.style.display = "block";
                }
            };
        }
    }
});

api.addEventListener("folder-loader-info", (event) => {
    const info = event.detail?.info;
    if (!info || !app.graph?._nodes) return;
    for (const node of app.graph._nodes) {
        if (node.type === "SequentialFolderImageLoader" && node._infoPanel) {
            node._updateInfoPanel(info);
        }
    }
});
