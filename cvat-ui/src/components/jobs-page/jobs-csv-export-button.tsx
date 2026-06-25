// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { JobsQuery } from 'reducers';
import i18n from 'i18n';
import { CSVColumn } from 'utils/csv-writer';
import { getCore, Job } from 'cvat-core-wrapper';
import createCSVExportButton from '../export-csv-button-hoc';

const cvat = getCore();

const columns: CSVColumn<Job>[] = [
    { header: i18n.t('resources:csv.headers.id'), accessor: (job) => job.id },
    { header: i18n.t('resources:csv.headers.jobUrl'), accessor: (job) => `${window.location.origin}/tasks/${job.taskId}/jobs/${job.id}` },
    { header: i18n.t('resources:csv.headers.taskId'), accessor: (job) => job.taskId },
    { header: i18n.t('resources:csv.headers.taskName'), accessor: (job) => job.taskName ?? '' },
    { header: i18n.t('resources:csv.headers.taskUrl'), accessor: (job) => `${window.location.origin}/tasks/${job.taskId}` },
    { header: i18n.t('resources:csv.headers.projectId'), accessor: (job) => job.projectId },
    { header: i18n.t('resources:csv.headers.projectName'), accessor: (job) => job.projectName ?? '' },
    { header: i18n.t('resources:csv.headers.projectUrl'), accessor: (job) => (job.projectId ? `${window.location.origin}/projects/${job.projectId}` : '') },
    { header: i18n.t('resources:csv.headers.assignee'), accessor: (job) => job.assignee?.username ?? '' },
    { header: i18n.t('resources:csv.headers.stage'), accessor: (job) => job.stage },
    { header: i18n.t('resources:csv.headers.state'), accessor: (job) => job.state },
    { header: i18n.t('resources:csv.headers.type'), accessor: (job) => job.type },
    { header: i18n.t('resources:csv.headers.startFrame'), accessor: (job) => job.startFrame },
    { header: i18n.t('resources:csv.headers.stopFrame'), accessor: (job) => job.stopFrame },
    { header: i18n.t('resources:csv.headers.frameCount'), accessor: (job) => job.stopFrame - job.startFrame + 1 },
    {
        header: i18n.t('resources:csv.headers.createdDate'),
        accessor: (job) => job.createdDate,
    },
    {
        header: i18n.t('resources:csv.headers.updatedDate'),
        accessor: (job) => job.updatedDate,
    },
];

const JobsCSVExportButton = createCSVExportButton<Job, JobsQuery>({
    resourceName: 'jobs',
    className: 'cvat-jobs-export-csv-button',
    tooltipTitle: i18n.t('resources:csv.tooltips.jobs'),
    columns,
    uniqueKey: 'id',
    fetchPage: async (query) => {
        const jobs = await cvat.jobs.get(query);
        return {
            results: jobs,
            count: jobs.count,
        };
    },
});

export default JobsCSVExportButton;
