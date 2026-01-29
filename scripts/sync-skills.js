#!/usr/bin/env node
/**
 * 技能数据同步脚本
 * 从 skills-repo 读取技能数据并生成索引
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import JSZip from 'jszip';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// 配置
const CONFIG = {
  // 本地 skills-repo 路径（优先，可通过环境变量指定）
  localRepoPath: process.env.SKILLS_REPO_PATH || path.resolve(ROOT_DIR, '../skills-repo'),
  // 远程仓库 URL（可选）
  remoteRepoUrl: process.argv.find(arg => arg.startsWith('--repo='))?.split('=')[1],
  // GitHub Token（用于克隆私有仓库）
  githubToken: process.env.GITHUB_TOKEN,
  // 输出路径
  outputPath: path.resolve(ROOT_DIR, 'src/data/skills.json'),
  // 下载目录
  downloadsDir: path.resolve(ROOT_DIR, 'public/downloads'),
  // 临时克隆目录（用于远程仓库）
  tempCloneDir: path.resolve(ROOT_DIR, '.temp-skills-repo'),
};

/**
 * 确保目录存在
 */
async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * 获取 skills-repo 路径（本地优先，否则克隆远程）
 */
async function getRepoPath() {
  // 检查本地是否存在
  try {
    await fs.access(CONFIG.localRepoPath);
    console.log(`✓ 使用本地 skills-repo: ${CONFIG.localRepoPath}`);
    return CONFIG.localRepoPath;
  } catch {
    console.log('✗ 本地 skills-repo 不存在');
  }

  // 如果有远程 URL，则克隆
  if (CONFIG.remoteRepoUrl) {
    console.log(`→ 克隆远程仓库: ${CONFIG.remoteRepoUrl}`);
    try {
      // 清理并重新克隆
      await fs.rm(CONFIG.tempCloneDir, { recursive: true, force: true });
      await ensureDir(CONFIG.tempCloneDir);

      // 如果有 GitHub Token，使用 token 认证克隆
      let cloneUrl = CONFIG.remoteRepoUrl;
      if (CONFIG.githubToken && cloneUrl.includes('github.com')) {
        // 将 https://github.com/user/repo 转换为 https://token@github.com/user/repo
        cloneUrl = cloneUrl.replace('https://github.com/', `https://x-access-token:${CONFIG.githubToken}@github.com/`);
      }

      execSync(`git clone --depth 1 ${cloneUrl} ${CONFIG.tempCloneDir}`, {
        stdio: 'inherit'
      });

      return CONFIG.tempCloneDir;
    } catch (error) {
      console.error('✗ 克隆仓库失败:', error.message);
      throw error;
    }
  }

  throw new Error('未找到 skills-repo，请确保本地存在或提供远程仓库 URL');
}

/**
 * 读取 skills.json 索引文件
 */
async function readSkillsIndex(repoPath) {
  const indexPath = path.join(repoPath, 'skills.json');
  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    const data = JSON.parse(content);
    // 创建以 name 为 key 的 Map
    const indexMap = new Map();
    if (Array.isArray(data.skills)) {
      for (const skill of data.skills) {
        indexMap.set(skill.name, skill);
      }
    }
    console.log(`✓ 读取索引文件，包含 ${indexMap.size} 个技能元数据`);
    return indexMap;
  } catch (error) {
    console.warn('⚠ 未找到或无法解析 skills.json，将仅使用 SKILL.md 数据');
    return new Map();
  }
}

/**
 * 读取 skills-json 目录下的独立技能元数据
 */
async function readSkillsJsonData(repoPath) {
  const skillsJsonDir = path.join(repoPath, 'skills-json');
  const skillsDataMap = new Map();

  try {
    const entries = await fs.readdir(skillsJsonDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

      const jsonPath = path.join(skillsJsonDir, entry.name);
      const content = await fs.readFile(jsonPath, 'utf-8');
      const skillData = JSON.parse(content);

      if (skillData.name) {
        skillsDataMap.set(skillData.name, skillData);
      }
    }

    console.log(`✓ 读取 skills-json 数据，包含 ${skillsDataMap.size} 个技能`);
  } catch (error) {
    console.warn('⚠ 无法读取 skills-json 目录:', error.message);
  }

  return skillsDataMap;
}

/**
 * 扫描目录获取所有技能
 */
async function scanSkills(repoPath) {
  // 读取索引文件作为元数据补充
  const skillsIndex = await readSkillsIndex(repoPath);
  // 读取 skills-json 目录下的独立元数据
  const skillsJsonData = await readSkillsJsonData(repoPath);

  // 技能存储在 skills-collection/ 子目录下
  const skillsCollectionPath = path.join(repoPath, 'skills-collection');

  try {
    await fs.access(skillsCollectionPath);
  } catch {
    console.error('✗ 未找到 skills-collection 目录，请检查 skills-repo 结构');
    return [];
  }

  const entries = await fs.readdir(skillsCollectionPath, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // 跳过隐藏目录和特殊目录
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const skillPath = path.join(skillsCollectionPath, entry.name);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    try {
      // 检查 SKILL.md 是否存在
      await fs.access(skillMdPath);

      // 读取并解析 SKILL.md
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const parsed = matter(content);

      // 获取索引中的元数据（如存在）
      const indexData = skillsIndex.get(entry.name) || {};
      // 获取 skills-json 中的元数据（如存在）
      const jsonData = skillsJsonData.get(entry.name) || {};

      // 提取文件列表
      const files = await scanSkillFiles(skillPath, entry.name);

      // 合并标签：优先使用 skills-json 中的 tags，其次是索引文件，最后是 SKILL.md
      const tags = Array.isArray(jsonData.tags) && jsonData.tags.length > 0
        ? jsonData.tags
        : (Array.isArray(indexData.tags) && indexData.tags.length > 0
          ? indexData.tags
          : (Array.isArray(parsed.data.tags) ? parsed.data.tags : []));

      skills.push({
        id: entry.name,
        name: parsed.data.name || entry.name,
        path: entry.name,
        description: parsed.data.description || jsonData.description || indexData.description || '',
        tags,
        version: parsed.data.version || jsonData.version || indexData.version || '1.0.0',
        author: parsed.data.author || jsonData.author || 'AI-Agent Team',
        updatedAt: parsed.data.updatedAt || jsonData.updatedAt || new Date().toISOString().split('T')[0],
        // 新增：从 skills-json 获取的额外字段
        stars: jsonData.stars || 0,
        sourceUrl: jsonData.sourceUrl || '',
        files,
        hasMultipleFiles: files.length > 1,
        content: parsed.content,
        downloadUrl: `downloads/${entry.name}.zip`,
        installCommand: `pa-skills add ${entry.name}`,
        downloadUrl: `/downloads/${entry.name}.zip`
      });

      console.log(`  ✓ 发现技能: ${entry.name} (标签: ${tags.length > 0 ? tags.join(', ') : '无'})`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`  ⚠ 跳过 ${entry.name}: ${error.message}`);
      }
    }
  }

  return skills;
}

/**
 * 扫描技能目录下的所有文件
 */
async function scanSkillFiles(skillPath, skillName) {
  const files = [];

  async function scanDir(dir, relativePath = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath, relPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const type = getFileType(ext);

        files.push({
          name: entry.name,
          path: path.join(skillName, relPath).replace(/\\/g, '/'),
          type,
          relativePath: relPath
        });
      }
    }
  }

  await scanDir(skillPath);

  // 按名称排序，确保 SKILL.md 在最前面
  return files.sort((a, b) => {
    if (a.name === 'SKILL.md') return -1;
    if (b.name === 'SKILL.md') return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 根据扩展名获取文件类型
 */
function getFileType(ext) {
  const typeMap = {
    '.md': 'markdown',
    '.js': 'code',
    '.ts': 'code',
    '.jsx': 'code',
    '.tsx': 'code',
    '.json': 'code',
    '.yaml': 'code',
    '.yml': 'code',
    '.sh': 'code',
    '.bash': 'code',
    '.py': 'code',
    '.rb': 'code',
    '.go': 'code',
    '.rs': 'code',
    '.java': 'code',
    '.c': 'code',
    '.cpp': 'code',
    '.h': 'code',
    '.css': 'code',
    '.scss': 'code',
    '.less': 'code',
    '.html': 'code',
    '.xml': 'code',
    '.txt': 'text',
    '.mdx': 'markdown',
  };

  return typeMap[ext] || 'text';
}

/**
 * 统计标签使用情况
 */
function calculateTags(skills) {
  const tagCount = new Map();

  for (const skill of skills) {
    if (Array.isArray(skill.tags)) {
      for (const tag of skill.tags) {
        if (tag && tag.trim()) {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        }
      }
    }
  }

  return Array.from(tagCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 打包技能为 ZIP
 */
async function packSkill(skill, repoPath) {
  const zip = new JSZip();
  // 技能存储在 skills-collection/ 子目录下
  const skillPath = path.join(repoPath, 'skills-collection', skill.id);

  async function addFilesToZip(dir, zipFolder) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const newFolder = zipFolder.folder(entry.name);
        await addFilesToZip(fullPath, newFolder);
      } else {
        const content = await fs.readFile(fullPath);
        zipFolder.file(entry.name, content);
      }
    }
  }

  await addFilesToZip(skillPath, zip);

  const zipPath = path.join(CONFIG.downloadsDir, `${skill.id}.zip`);
  const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(zipPath, zipContent);

  // 获取文件大小
  const stats = await fs.stat(zipPath);
  const sizeKB = (stats.size / 1024).toFixed(1);

  console.log(`  ✓ 打包: ${skill.id}.zip (${sizeKB} KB)`);

  return sizeKB;
}

/**
 * 生成技能索引 JSON
 */
async function generateIndex(skills) {
  const tags = calculateTags(skills);

  const index = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceRepo: CONFIG.remoteRepoUrl || 'local',
      total: skills.length,
      version: '1.0.0'
    },
    tags,
    skills: skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      path: skill.path,
      description: skill.description,
      tags: skill.tags,
      version: skill.version,
      author: skill.author,
      updatedAt: skill.updatedAt,
      stars: skill.stars,
      sourceUrl: skill.sourceUrl,
      files: skill.files,
      hasMultipleFiles: skill.hasMultipleFiles,
      downloadUrl: skill.downloadUrl,
      installCommand: skill.installCommand
    }))
  };

  return index;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始同步技能数据...\n');

  try {
    // 确保输出目录存在
    await ensureDir(path.dirname(CONFIG.outputPath));
    await ensureDir(CONFIG.downloadsDir);

    // 清理旧的下载文件
    console.log('→ 清理旧的下载文件...');
    const oldDownloads = await fs.readdir(CONFIG.downloadsDir).catch(() => []);
    for (const file of oldDownloads) {
      await fs.unlink(path.join(CONFIG.downloadsDir, file));
    }

    // 获取仓库路径
    const repoPath = await getRepoPath();
    console.log();

    // 扫描技能
    console.log('→ 扫描技能目录...');
    const skills = await scanSkills(repoPath);
    console.log(`✓ 发现 ${skills.length} 个技能\n`);

    if (skills.length === 0) {
      console.warn('⚠ 未发现任何技能，请检查 skills-repo');
      return;
    }

    // 打包技能
    console.log('→ 打包技能...');
    for (const skill of skills) {
      await packSkill(skill, repoPath);
    }
    console.log();

    // 生成索引
    console.log('→ 生成索引文件...');
    const index = await generateIndex(skills);
    await fs.writeFile(CONFIG.outputPath, JSON.stringify(index, null, 2));
    console.log(`✓ 索引已保存: ${CONFIG.outputPath}\n`);

    // 保存详细内容（用于构建时预渲染）
    const contentDir = path.join(ROOT_DIR, 'src/data/contents');
    await ensureDir(contentDir);

    for (const skill of skills) {
      const contentPath = path.join(contentDir, `${skill.id}.json`);
      await fs.writeFile(contentPath, JSON.stringify({
        content: skill.content,
        files: skill.files
      }, null, 2));
    }
    console.log(`✓ 技能内容已保存到: ${contentDir}\n`);

    // 统计信息
    console.log('📊 同步统计:');
    console.log(`  - 技能总数: ${skills.length}`);
    console.log(`  - 标签总数: ${index.tags.length}`);
    console.log(`  - 多文件技能: ${skills.filter(s => s.hasMultipleFiles).length}`);
    console.log(`  - 单文件技能: ${skills.filter(s => !s.hasMultipleFiles).length}`);

    // 清理临时目录
    if (repoPath === CONFIG.tempCloneDir) {
      console.log('\n→ 清理临时目录...');
      await fs.rm(CONFIG.tempCloneDir, { recursive: true, force: true });
    }

    console.log('\n✅ 同步完成!');
  } catch (error) {
    console.error('\n❌ 同步失败:', error.message);
    process.exit(1);
  }
}

main();
