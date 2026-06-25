// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { ProjectsQuery } from 'reducers';
import i18n from 'i18n';
import { CSVColumn } from 'utils/csv-writer';
import { getCore, Project } from 'cvat-core-wrapper';
import createCSVExportButton from '../export-csv-button-hoc';

const cvat = getCore();

const columns: CSVColumn<Project>[] = [
    { header: i18n.t('resources:csv.headers.id'), accessor: (project) => project.id },
    { header: i18n.t('resources:csv.headers.name'), accessor: (project) => project.name },
    { header: i18n.t('resources:csv.headers.projectUrl'), accessor: (project) => `${window.location.origin}/projects/${project.id}` },
    { header: i18n.t('resources:csv.headers.owner'), accessor: (project) => project.owner?.username ?? '' },
    { header: i18n.t('resources:csv.headers.assignee'), accessor: (project) => project.assignee?.username ?? '' },
    { header: i18n.t('resources:csv.headers.status'), accessor: (project) => project.status },
    { header: i18n.t('resources:csv.headers.dimension'), accessor: (project) => project.dimension },
    {
        header: i18n.t('resources:csv.headers.taskSubsets'),
        accessor: (project) => (
            project.subsets && project.subsets.length > 0 ?
                project.subsets.join(', ') :
                ''
        ),
    },
    {
        header: i18n.t('resources:csv.headers.createdDate'),
        accessor: (project) => project.createdDate,
    },
    {
        header: i18n.t('resources:csv.headers.updatedDate'),
        accessor: (project) => project.updatedDate,
    },
    { header: i18n.t('resources:csv.headers.bugTracker'), accessor: (project) => project.bugTracker ?? '' },
];

const ProjectsCSVExportButton = createCSVExportButton<Project, ProjectsQuery>({
    resourceName: 'projects',
    className: 'cvat-projects-export-csv-button',
    tooltipTitle: i18n.t('resources:csv.tooltips.projects'),
    columns,
    uniqueKey: 'id',
    fetchPage: async (query) => {
        const projects = await cvat.projects.get(query);
        return {
            results: projects,
            count: projects.count,
        };
    },
});

export default ProjectsCSVExportButton;
