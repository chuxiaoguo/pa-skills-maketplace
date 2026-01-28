# PA Skills Marketplace

内网技能市场（Skills Marketplace）- 基于 Astro 构建的纯静态网站，用于展示和管理 skills-repo 中的技能。

🔗 **在线访问**: https://chuxiaoguo.github.io/pa-skills-maketplace

## 功能特性

- 🏠 **首页** - 技能网格展示、标签云、实时搜索
- 🏷️ **分类页** - 按标签筛选技能，支持分页
- 📄 **技能详情** - 两栏布局：概览/文件树/内容 + 安装命令/下载
- 🔧 **数据同步** - 从 skills-repo 自动同步技能数据
- 📦 **资源打包** - 自动打包技能为 ZIP 供下载
- 🚀 **自动部署** - GitHub Actions 自动构建部署到 Pages

## 技术栈

- [Astro](https://astro.build/) - 静态站点生成器
- [Tailwind CSS](https://tailwindcss.com/) - 原子化 CSS
- [Fuse.js](https://www.fusejs.io/) - 客户端模糊搜索
- GitHub Pages - 静态托管

## 本地开发

```bash
# 安装依赖
npm install

# 同步技能数据（从 skills-repo）
npm run sync-skills

# 启动开发服务器
npm run dev

# 访问 http://localhost:4321
```

## 构建

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## 配置说明

### 环境变量

在 GitHub 仓库 Settings > Secrets and variables > Actions 中配置：

| Secret | 说明 | 示例 |
|--------|------|------|
| `SKILLS_REPO_URL` | 技能仓库地址 | `https://github.com/chuxiaoguo/skills-repo` |

### 触发部署

1. **自动触发** - 推送到 `main` 分支时自动部署
2. **手动触发** - 在 Actions 页面点击 "Run workflow"
3. **Webhook 触发** - skills-repo 更新时发送 `repository_dispatch` 事件

## 项目结构

```
skills-marketplace/
├── .github/workflows/deploy.yml  # GitHub Actions CI/CD
├── scripts/
│   └── sync-skills.js            # 数据同步脚本
├── src/
│   ├── components/               # 组件
│   ├── data/                     # 技能数据
│   ├── layouts/                  # 布局
│   ├── pages/                    # 页面
│   └── styles/                   # 样式
├── public/downloads/             # ZIP 下载文件
└── dist/                         # 构建输出
```

## 数据同步

同步脚本会：
1. 读取 skills-repo 中的技能目录
2. 解析每个技能的 SKILL.md
3. 提取元数据（名称、描述、标签等）
4. 打包技能为 ZIP 文件
5. 生成 skills.json 索引

```bash
npm run sync-skills
```

## 许可证

MIT
