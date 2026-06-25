// Copyright (C) 2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { Config } from '@react-awesome-query-builder/antd';
import i18n from 'i18n';
import asyncFetchUsers from 'components/resource-sorting-filtering/request-users';

export const config: Partial<Config> = {
    fields: {
        dimension: {
            label: i18n.t('resources:fields.dimension'),
            type: 'select',
            operators: ['select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: '2d', title: i18n.t('resources:dimension.2d') },
                    { value: '3d', title: i18n.t('resources:dimension.3d') },
                ],
            },
        },
        status: {
            label: i18n.t('resources:fields.status'),
            type: 'select',
            valueSources: ['value'],
            operators: ['select_equals', 'select_any_in', 'select_not_any_in'],
            fieldSettings: {
                listValues: [
                    { value: 'annotation', title: i18n.t('resources:status.annotation') },
                    { value: 'validation', title: i18n.t('resources:status.validation') },
                    { value: 'completed', title: i18n.t('resources:status.completed') },
                ],
            },
        },
        mode: {
            label: i18n.t('resources:fields.data'),
            type: 'select',
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'interpolation', title: i18n.t('resources:data.video') },
                    { value: 'annotation', title: i18n.t('resources:data.images') },
                ],
            },
        },
        subset: {
            label: i18n.t('resources:fields.subset'),
            type: 'text',
            valueSources: ['value'],
            operators: ['equal'],
        },
        assignee: {
            label: i18n.t('resources:fields.assignee'),
            type: 'select',
            valueSources: ['value'],
            operators: ['select_equals'],
            fieldSettings: {
                useAsyncSearch: true,
                forceAsyncSearch: true,
                asyncFetch: asyncFetchUsers,
            },
        },
        owner: {
            label: i18n.t('resources:fields.owner'),
            type: 'select',
            valueSources: ['value'],
            operators: ['select_equals'],
            fieldSettings: {
                useAsyncSearch: true,
                forceAsyncSearch: true,
                asyncFetch: asyncFetchUsers,
            },
        },
        updated_date: {
            label: i18n.t('resources:fields.lastUpdated'),
            type: 'datetime',
            operators: ['between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
        },
        id: {
            label: i18n.t('resources:fields.id'),
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
        project_id: {
            label: i18n.t('resources:fields.projectId'),
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
        name: {
            label: i18n.t('resources:fields.name'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
        project_name: {
            label: i18n.t('resources:fields.projectName'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
    },
};

export const localStorageRecentCapacity = 10;
export const localStorageRecentKeyword = 'recentlyAppliedTasksFilters';
export const predefinedFilterValues = {
    [i18n.t('resources:filters.assignedToMe')]: '{"and":[{"==":[{"var":"assignee"},"<username>"]}]}',
    [i18n.t('resources:filters.ownedByMe')]: '{"and":[{"==":[{"var":"owner"},"<username>"]}]}',
    [i18n.t('resources:filters.notCompleted')]: '{"!":{"and":[{"==":[{"var":"status"},"completed"]}]}}',
};
