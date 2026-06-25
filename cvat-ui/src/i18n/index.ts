// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import audioPlugins from './locales/zh-CN/audioPlugins.json';
import auth from './locales/zh-CN/auth.json';
import common from './locales/zh-CN/common.json';
import forms from './locales/zh-CN/forms.json';
import header from './locales/zh-CN/header.json';
import importExport from './locales/zh-CN/importExport.json';
import qualityReviewModels from './locales/zh-CN/qualityReviewModels.json';
import resourcesZh from './locales/zh-CN/resources.json';

export const DEFAULT_LANGUAGE = 'zh-CN';
export const DAYJS_LANGUAGE = 'zh-cn';
export const DEFAULT_NAMESPACE = 'common';

export const resources = {
    [DEFAULT_LANGUAGE]: {
        audioPlugins,
        auth,
        common,
        forms,
        header,
        importExport,
        qualityReviewModels,
        resources: resourcesZh,
    },
} as const;

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: DEFAULT_LANGUAGE,
        fallbackLng: DEFAULT_LANGUAGE,
        defaultNS: DEFAULT_NAMESPACE,
        ns: [
            DEFAULT_NAMESPACE,
            'audioPlugins',
            'auth',
            'forms',
            'header',
            'importExport',
            'qualityReviewModels',
            'resources',
        ],
        initImmediate: false,
        interpolation: {
            escapeValue: false,
        },
        react: {
            useSuspense: false,
        },
        returnEmptyString: false,
    });

export default i18n;
