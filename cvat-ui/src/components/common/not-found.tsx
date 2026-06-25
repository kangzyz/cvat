// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';
import Result from 'antd/lib/result';
import Button from 'antd/lib/button';
import { useHistory } from 'react-router-dom';

function useReturnButton(fallbackPath: string): () => void {
    const history = useHistory();
    const handleReturn = (): void => {
        if (history.length > 2) {
            history.goBack();
        } else {
            history.push(fallbackPath);
        }
    };
    return handleReturn;
}

export const JobNotFoundComponent = React.memo((): JSX.Element => {
    const handleReturn = useReturnButton('/jobs');
    const { t } = useTranslation('common');
    return (
        <Result
            className='cvat-not-found'
            status='404'
            title={t('notFound.jobTitle')}
            subTitle={t('notFound.commonSubtitle')}
            extra={<Button type='primary' onClick={handleReturn}>{t('notFound.returnPreviousPage')}</Button>}
        />
    );
});

export const TaskNotFoundComponent = React.memo((): JSX.Element => {
    const handleReturn = useReturnButton('/tasks');
    const { t } = useTranslation('common');
    return (
        <Result
            className='cvat-not-found'
            status='404'
            title={t('notFound.taskTitle')}
            subTitle={t('notFound.commonSubtitle')}
            extra={<Button type='primary' onClick={handleReturn}>{t('notFound.returnPreviousPage')}</Button>}
        />
    );
});

export const ProjectNotFoundComponent = React.memo((): JSX.Element => {
    const handleReturn = useReturnButton('/projects');
    const { t } = useTranslation('common');
    return (
        <Result
            className='cvat-not-found'
            status='404'
            title={t('notFound.projectTitle')}
            subTitle={t('notFound.projectSubtitle')}
            extra={<Button type='primary' onClick={handleReturn}>{t('notFound.returnPreviousPage')}</Button>}
        />
    );
});

export const CloudStorageNotFoundComponent = React.memo((): JSX.Element => {
    const handleReturn = useReturnButton('/cloudstorages');
    const { t } = useTranslation('common');
    return (
        <Result
            className='cvat-not-found'
            status='404'
            title={t('notFound.cloudStorageTitle')}
            subTitle={t('notFound.cloudStorageSubtitle')}
            extra={<Button type='primary' onClick={handleReturn}>{t('notFound.returnPreviousPage')}</Button>}
        />
    );
});
