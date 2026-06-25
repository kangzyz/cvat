// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { CombinedState } from 'reducers';

function CVATLogo(): JSX.Element {
    const logo = useSelector((state: CombinedState) => state.about.server.logoURL);
    const { t } = useTranslation('common');

    return (
        <div className='cvat-logo-icon'>
            <img src={logo} alt={t('common.logoAlt')} />
        </div>
    );
}

export default React.memo(CVATLogo);
