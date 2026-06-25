# CVAT UI Chinese Localization

This directory is the home for the CVAT UI Simplified Chinese localization.
The current product target is Chinese-first UI text with consistent domain
terminology.

## Scope

Translate user-visible frontend text in these areas:

- `cvat-ui/src`: React pages, containers, shared components, validation text,
  notifications, modals, tooltips, empty states, table columns, filters, and
  static browser metadata owned by the UI.
- `cvat-ui/src/audio`: audio annotation pages and controls.
- `cvat-ui/plugins`: bundled UI plugins when they render visible text.
- `cvat-canvas` and `cvat-canvas3d`: only user-facing canvas messages,
  labels, warnings, and tooltips.
- Ant Design and Dayjs locale output.

Do not translate implementation identifiers:

- API field names, enum wire values, route paths, CSS class names, test names,
  action type constants, Redux state keys, storage keys, and analytics event
  names.
- User-authored data such as project names, task names, label names, model names,
  dataset file names, and cloud storage names.
- File format names, model provider names, package names, and brand names unless
  the source text is a descriptive UI label instead of a proper name.

When an API enum is displayed to users, keep the stored value unchanged and add a
display mapping through i18n resources or a typed formatter.

## Translation Rules

- Prefer standard product Chinese over literal word-for-word translation.
- Keep one Chinese term for each CVAT concept across all pages.
- Preserve shortcuts, variable placeholders, IDs, frame numbers, file extensions,
  and format names.
- Use concise button labels and table headers.
- Use full explanatory Chinese in tooltips, validation, and notifications.
- Avoid mixing English and Chinese unless the English term is a product name,
  model name, file format, shortcut, or protocol.

## Glossary

| English | Chinese |
| --- | --- |
| Annotation | 标注 |
| Annotation guide | 标注指南 |
| Attribute | 属性 |
| Cloud storage | 云存储 |
| Conflict | 冲突 |
| Consensus | 共识 |
| Dataset | 数据集 |
| Export | 导出 |
| Frame | 帧 |
| Guide | 指南 |
| Import | 导入 |
| Issue | 问题 |
| Job | 作业 |
| Label | 标签 |
| Model | 模型 |
| Organization | 组织 |
| Project | 项目 |
| Quality control | 质量控制 |
| Request | 请求 |
| Review | 审查 |
| Shape | 形状 |
| Shortcut | 快捷键 |
| Subset | 子集 |
| Tag | 标记 |
| Task | 任务 |
| Track | 轨迹 |
| Webhook | Webhook |

## Runtime Structure

- `index.ts` initializes `i18next` and `react-i18next`.
- `locales/zh-CN/*.json` stores Chinese resources by namespace.
- The app currently runs with `zh-CN` as the default and fallback language.
- Add new namespaces only when a module has enough strings to justify it.

