// Copyright (C) 2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { Config } from '@react-awesome-query-builder/antd';
import i18n from 'i18n';
import asyncFetchUsers from 'components/resource-sorting-filtering/request-users';

export const config: Partial<Config> = {
    fields: {
        id: {
            label: i18n.t('resources:fields.id'),
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
    },
};

export const localStorageRecentCapacity = 10;
export const localStorageRecentKeyword = 'recentlyAppliedProjectsFilters';
export const predefinedFilterValues = {
    [i18n.t('resources:filters.assignedToMe')]: '{"and":[{"==":[{"var":"assignee"},"<username>"]}]}',
    [i18n.t('resources:filters.ownedByMe')]: '{"and":[{"==":[{"var":"owner"},"<username>"]}]}',
    [i18n.t('resources:filters.notCompleted')]: '{"!":{"and":[{"==":[{"var":"status"},"completed"]}]}}',
};
