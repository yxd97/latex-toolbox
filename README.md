# LaTeX Toolbox · TeX 作坊

纯浏览器运行的 LaTeX 表格与多联图编辑工具。可视化编辑布局和样式，实时生成可复制的 LaTeX 代码，无需安装依赖、登录或上传文件。

**在线使用：** [yxd97.github.io/latex-toolbox](https://yxd97.github.io/latex-toolbox/)

## 功能

- **表格编辑**：区域选择、复制粘贴、增删行列、合并拆分、列宽、文字样式、颜色与边框；支持 CSV 导入，导出 `tabular` / `tabularx` 与 `adjustbox`。
- **图片排版**：按行排列单图、二联图、三联图，支持拖动排序、宽度和水平间隔，以及总 caption、子图 caption 和 label。
- **LaTeX 导出**：支持单栏与跨双栏，布局尺寸以 `\linewidth` 为单位；提供代码、宏包清单及包含原图的 ZIP。
- **本地项目**：浏览器自动保存，支持项目 JSON 导入导出和撤销重做。所有编辑和文件处理均在本地完成。

## 本地使用

下载仓库后，用浏览器打开 `index.html`；也可在仓库目录启动静态服务：

```sh
python -m http.server 8766 --bind 127.0.0.1
```

然后访问 [http://127.0.0.1:8766/](http://127.0.0.1:8766/)。无需构建或安装前端依赖。

## 约定与限制

- 预览用于确认布局和样式，不保证与最终 PDF 的字体、换行完全一致。
- 普通文字自动转义，暂不支持公式或原始 LaTeX；不提供垂直间距控制，也不生成 `\vspace`。
- 图片引用只使用文件名。PNG / JPEG / PDF 使用 `\includegraphics`；SVG 使用 `\includesvg`，实际编译需要 Inkscape 和 shell-escape。PDF 在编辑器中使用占位预览。
- 表格最多 100 行、40 列；图片每行最多 3 张。建议定期下载项目 JSON 备份。

## 开发与部署

使用 Node.js 运行核心测试：

```sh
node --test tests/core.test.js
```

GitHub Pages 从 `main` 分支根目录发布，`.nojekyll` 禁用 Jekyll 处理。推送到 `main` 后自动更新站点。

## 开源协议

[MIT](LICENSE)
