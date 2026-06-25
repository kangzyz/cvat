// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useTranslation } from 'react-i18next';

interface NameTemplateTooltipProps {
    example: string;
}

function NameTemplateTooltip({ example }: NameTemplateTooltipProps): JSX.Element {
    const { t } = useTranslation('common');
    return (
        <>
            {t('nameTemplate.intro')}
            <ul style={{ marginBottom: 0 }}>
                <li>
                    <code>{'{{id}}'}</code>
                    <br />
                    {t('nameTemplate.resourceId')}
                </li>
                <li>
                    <code>{'{{name}}'}</code>
                    <br />
                    {t('nameTemplate.resourceName')}
                </li>
                <li>
                    <code>{'{{index}}'}</code>
                    <br />
                    {t('nameTemplate.selectionIndex')}
                </li>
            </ul>
            <div>
                {t('nameTemplate.example')}
                <br />
                <i>{example}</i>
            </div>
        </>
    );
}

export default React.memo(NameTemplateTooltip);
