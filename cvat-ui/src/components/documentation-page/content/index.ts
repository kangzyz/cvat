// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import overview from './overview.md';
import gettingStarted from './getting-started.md';
import installation from './installation.md';
import interfaceGuide from './interface.md';
import tasksProjects from './tasks-projects.md';
import manualAnnotation from './manual-annotation.md';
import shapes from './shapes.md';
import autoAnnotation from './auto-annotation.md';
import datasetManagement from './dataset-management.md';
import shortcuts from './shortcuts.md';
import faq from './faq.md';

export interface DocPage {
    slug: string;
    title: string;
    content: string;
}

// Ordered list of localized community documentation pages.
const docPages: DocPage[] = [
    { slug: 'overview', title: '概述', content: overview },
    { slug: 'getting-started', title: '快速开始', content: gettingStarted },
    { slug: 'installation', title: '安装部署', content: installation },
    { slug: 'interface', title: '界面导航', content: interfaceGuide },
    { slug: 'tasks-projects', title: '项目与任务管理', content: tasksProjects },
    { slug: 'manual-annotation', title: '手动标注', content: manualAnnotation },
    { slug: 'shapes', title: '标注形状', content: shapes },
    { slug: 'auto-annotation', title: '自动标注', content: autoAnnotation },
    { slug: 'dataset-management', title: '数据集管理', content: datasetManagement },
    { slug: 'shortcuts', title: '快捷键', content: shortcuts },
    { slug: 'faq', title: '常见问题', content: faq },
];

export default docPages;
