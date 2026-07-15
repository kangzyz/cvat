// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import List from 'antd/lib/list';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';

import { Issue, Task } from 'cvat-core-wrapper';
import { makeReviewURL } from '../quality-control-utils';

interface Props {
    task: Task;
    issues: Issue[];
}

export default function ManualIssuesSummary({ task, issues }: Readonly<Props>): JSX.Element {
    const { t } = useTranslation('qualityReviewModels');
    const unresolved = issues.filter(({ resolved }) => !resolved);
    const resolved = issues.length - unresolved.length;

    return (
        <section className='cvat-quality-section cvat-quality-manual-issues'>
            <div className='cvat-quality-section-heading'>
                <div>
                    <Text strong>{t('quality.overview.manualIssues.title')}</Text>
                    <Text type='secondary'>{t('quality.overview.manualIssues.description')}</Text>
                </div>
                <div>
                    <Tag color={unresolved.length ? 'warning' : 'default'}>
                        {t('quality.overview.manualIssues.unresolved', { count: unresolved.length })}
                    </Tag>
                    <Tag>{t('quality.overview.manualIssues.resolved', { count: resolved })}</Tag>
                </div>
            </div>
            {unresolved.length > 0 && (
                <List
                    size='small'
                    dataSource={unresolved.slice(0, 3)}
                    renderItem={(issue) => (
                        <List.Item
                            actions={[
                                <Link key='review' to={makeReviewURL(task.id, issue.job, issue.frame)}>
                                    {t('quality.overview.drawer.openReview')}
                                </Link>,
                            ]}
                        >
                            <Text>{t('quality.overview.manualIssues.item', {
                                id: issue.id,
                                job: issue.job,
                                frame: issue.frame,
                            })}</Text>
                        </List.Item>
                    )}
                />
            )}
        </section>
    );
}
