# kb-graph

把一个 markdown 知识库渲染成可交互的 3D 关系图。**单个 HTML 文件，没有后端。**

**在线打开 → https://zp-home.github.io/kb-graph/**（点「载入示例」看效果）

## 隐私

**你的数据不会离开浏览器。** 这个页面是纯静态的，没有服务端、没有上传接口、
没有分析脚本。你选的 `graph.json` 由浏览器本地 `FileReader` 解析，只存在于内存里。

所以它拿来看**私有**知识库是安全的：渲染器公开，数据留在你自己机器上。
仓库的 `.gitignore` 默认忽略一切 `*.json`（只放行 `sample.json`），
就是为了防止有人不小心把自己的数据提交上来。

## 用法

### 1. 生成 graph.json

自己的知识库用自己的脚本生成即可，只要输出下面这个结构。
参考实现见 [`build-graph.mjs`](build-graph.mjs)：扫 `git ls-files '*.md'`，
把 markdown 相对链接 `](x.md)` 和 wikilink `[[x]]` 当作边。

```bash
node build-graph.mjs            # 在你的知识库仓库根目录跑
```

### 2. 打开页面，把 graph.json 拖进去

或者点「选择文件」。也支持 `?data=<url>` 从一个可访问的 URL 拉取。

### 3. 它会记住你选的文件

选过一次之后，下次打开这个页面会直接出图，不用再选。两层机制：

- `localStorage` 存一份副本 —— 所有浏览器都支持，秒开
- File System Access API 存**文件句柄** —— Chrome / Edge 才有，好处是能
  「重新读取同一个文件」：你重新生成 `graph.json` 之后，页面上点一下就刷新，
  权限还在时甚至会自动刷新

顶部会出现一条：`来自 graph.json · 时间 · 重新读取 · 换文件 · 清除`。

这些都存在你自己浏览器里。**这个页面没有后端，什么都不会上传。**

## graph.json 格式

```json
{
  "nodes": [
    { "id": "conventions/README.md", "title": "写作规范",
      "group": "conventions", "lines": 40, "isIndex": true, "deg": 4 }
  ],
  "links": [
    { "source": "README.md", "target": "conventions/README.md", "kind": "link" }
  ],
  "groups": ["(根)", "conventions"]
}
```

| 字段 | 作用 | 必填 |
|---|---|---|
| `id` | 唯一标识，一般用仓库内相对路径 | 是 |
| `title` | 显示的标签，建议取文件里的一级标题 | 是 |
| `group` | 分组，决定颜色；一般取顶层目录 | 是 |
| `deg` | 链接度数，决定节点大小 | 是 |
| `lines` | 行数，详情面板显示 | 否 |
| `isIndex` | 是否索引页，画得大一点 | 否 |
| `kind` | 边类型：`link` / `wiki` / `dir`（`dir` 默认隐藏） | 否 |

`source` / `target` 必须是存在的 `id`，否则那条边会被丢掉。

## 交互

| 操作 | 效果 |
|---|---|
| 拖拽 / 滚轮 | 旋转 / 缩放 |
| 点节点 | 聚焦，右下角显示路径、行数、相邻条目（可点着跳） |
| 搜索框 | 匹配标题或路径，不匹配的变暗 |
| 点图例 | 按分组显示 / 隐藏 |
| 显示目录归属边 | 打开后，没有任何链接的孤立条目也能挂在它所属目录的索引页上 |
| 压成 2D | 节点数少时 2D 通常比 3D 好读 |

## 依赖

只有一个，从 CDN 加载：[3d-force-graph](https://github.com/vasturiano/3d-force-graph)（MIT，含 Three.js）。
没有构建步骤，没有 npm install。

## License

MIT
