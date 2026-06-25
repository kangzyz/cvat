// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { TasksQuery } from 'reducers';
import i18n from 'i18n';
import { CSVColumn } from 'utils/csv-writer';
import { getCore, Task } from 'cvat-core-wrapper';
import createCSVExportButton from '../export-csv-button-hoc';

const cvat = getCore();

const columns: CSVColumn<Task>[] = [
    { header: i18n.t('resources:csv.headers.id'), accessor: (task) => task.id },
    { header: i18n.t('resources:csv.headers.name'), accessor: (task) => task.name },
    { header: i18n.t('resources:csv.headers.taskUrl'), accessor: (task) => `${window.location.origin}/tasks/${task.id}` },
    { header: i18n.t('resources:csv.headers.projectId'), accessor: (task) => task.projectId },
    { header: i18n.t('resources:csv.headers.projectName'), accessor: (task) => task.projectName ?? '' },
    { header: i18n.t('resources:csv.headers.projectUrl'), accessor: (task) => (task.projectId ? `${window.location.origin}/projects/${task.projectId}` : '') },
    { header: i18n.t('resources:csv.headers.owner'), accessor: (task) => task.owner?.username ?? '' },
    { header: i18n.t('resources:csv.headers.assignee'), accessor: (task) => task.assignee?.username ?? '' },
    { header: i18n.t('resources:csv.headers.status'), accessor: (task) => task.status },
    { header: i18n.t('resources:csv.headers.mode'), accessor: (task) => task.mode },
    { header: i18n.t('resources:csv.headers.size'), accessor: (task) => task.size },
    { header: i18n.t('resources:csv.headers.subset'), accessor: (task) => task.subset ?? '' },
    {
        header: i18n.t('resources:csv.headers.createdDate'),
        accessor: (task) => task.createdDate,
    },
    {
        header: i18n.t('resources:csv.headers.updatedDate'),
        accessor: (task) => task.updatedDate,
    },
    { header: i18n.t('resources:csv.headers.bugTracker'), accessor: (task) => task.bugTracker ?? '' },
];

const TasksCSVExportButton = createCSVExportButton<Task, TasksQuery>({
    resourceName: 'tasks',
    className: 'cvat-tasks-export-csv-button',
    tooltipTitle: i18n.t('resources:csv.tooltips.tasks'),
    columns,
    uniqueKey: 'id',
    fetchPage: async (query) => {
        const tasks = await cvat.tasks.get(query);
        return {
            results: tasks,
            count: tasks.count,
        };
    },
});

export default TasksCSVExportButton;
