# 原型验证记录

日期：2026-10-16。Windows，本地静态 HTTP 预览，桌面 Chromium 浏览器。

## 已通过

- `node --check`：core.js、table-editor.js、figure-editor.js、app.js。
- `node --test tests/core.test.js`：11 项测试全部通过，覆盖 CSV、特殊字符、合并单元格、边框样式、宽度预算、浮动体、SVG 命令、项目规范化和子图编号。
- 实际 TeX 编译：桌面内置 Tectonic 成功编译 `tests/fixtures/main.tex`，覆盖 tabularx、tabular 合并网格、跨行／跨列、自定义边框、PNG 二联图／三联图、带空格的图片文件名、无图注子图计数，以及 20% 宽度的 40 列压力样例。
- 浏览器：双击编辑、文本特殊字符正确转义；Shift 选择矩形区域、合并、拆分后覆盖内容恢复。
- 浏览器：带引号、逗号、双引号转义、单元格内换行、空字段的 CSV 自动识别为 3 行 × 3 列，预览后正确导入。
- 浏览器：从剪贴板粘贴 2×2 TSV 区域，四格正确分配。
- 浏览器：单栏切换跨双栏导出 `table*`；实际键盘输入整体宽度 75%，预览和 `0.75\linewidth` 同步；总 caption 直接编辑后转义生效。
- 浏览器：刷新恢复项目名称、表格数据、宽度和跨栏选项。
- 浏览器：本地 PNG 添加到已有二联图后，三联图宽度为 0.32、间隔为 0.02；两张 SVG 自动导出 `includesvg`，PNG 导出 `includegraphics`。
- 浏览器：将三联图的单张宽度改为 0.5 被明确拒绝，数据仍为 0.32；范围滑块与数值框一致。
- 浏览器：左右排序、添加行、移动图片到下一行后，原行恢复两图各 0.49，新行单图宽 1。
- 浏览器：ZIP 与完整项目 JSON 下载、JSON 再次打开，以及图片数据的撤销／重做。
- Python ZIP 校验：CRC 正确，文件清单和 LaTeX 引用相符，导出的 `panel one.png` 与上传原图逐字节相等。
- 项目 JSON 校验：包含全部三张图片 data URL，无内部历史 token。
- 浏览器错误日志：空。

## 验证范围与限制

- 浏览器交互验证通过 HTTP 静态服务完成。应用没有模块加载、CDN 或服务器 API，源码支持直接打开 index.html；自动化浏览器策略禁止 `file://` 导航，因此未在该浏览器中实测文件协议下的存储／剪贴板。
- 未实测 SVG 的 Inkscape / shell-escape 外部转换流程。
- 预览不要求与最终 PDF 的字体、换行或浮动位置完全一致。
- `multirow` 与 `colortbl` 的跨行背景填充存在已提示的限制。
- 桌面浏览器已测；响应式样式已实现，移动设备和其他浏览器未逐一实测。

截图：`table-preview.png`、`figure-preview.png`。
