// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { Config } from '@react-awesome-query-builder/antd';
import asyncFetchUsers from 'components/resource-sorting-filtering/request-users';

export const config: Partial<Config> = {
    fields: {
        user: {
            label: '用户',
            type: 'select',
            valueSources: ['value'],
            operators: ['select_equals'],
            fieldSettings: {
                useAsyncSearch: true,
                forceAsyncSearch: true,
                asyncFetch: asyncFetchUsers,
            },
        },
        role: {
            label: '角色',
            type: 'select',
            operators: ['select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'worker', title: '成员' },
                    { value: 'supervisor', title: '主管' },
                    { value: 'maintainer', title: '维护者' },
                    { value: 'owner', title: '所有者' },
                ],
            },
        },
    },
};

export const localStorageRecentCapacity = 10;
export const localStorageRecentKeyword = 'recentlyAppliedMembershipsFilters';
export const predefinedFilterValues = {
    Workers: '{"and":[{"==":[{"var":"role"},"worker"]}]}',
    Supervisors: '{"and":[{"==":[{"var":"role"},"supervisor"]}]}',
    Maintainers: '{"and":[{"==":[{"var":"role"},"maintainer"]}]}',
};
