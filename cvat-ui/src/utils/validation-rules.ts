// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { RuleObject } from 'antd/lib/form';
// eslint-disable-next-line import/no-extraneous-dependencies
import { RuleType } from 'rc-field-form/lib/interface';
import i18n from 'i18n';

import patterns from './validation-patterns';

export function validateUsername(_: RuleObject, value: string): Promise<void> {
    if (!value) {
        return Promise.resolve();
    }

    if (!patterns.validateUsernameLength.pattern.test(value)) {
        return Promise.reject(new Error(patterns.validateUsernameLength.message));
    }

    if (!patterns.validateUsernameCharacters.pattern.test(value)) {
        return Promise.reject(new Error(patterns.validateUsernameCharacters.message));
    }

    return Promise.resolve();
}

const validationRules = {
    firstName: [
        {
            required: true,
            message: i18n.t('common:validation.firstNameRequired'),
            pattern: patterns.validateName.pattern,
        },
    ],

    lastName: [
        {
            required: true,
            message: i18n.t('common:validation.lastNameRequired'),
            pattern: patterns.validateName.pattern,
        },
    ],

    email: [
        {
            type: 'email' as RuleType,
            message: i18n.t('common:validation.invalidEmail'),
        },
        {
            required: true,
            message: i18n.t('common:validation.emailRequired'),
        },
    ],

    userName: [
        {
            required: true,
            message: i18n.t('common:validation.usernameRequired'),
        },
        {
            validator: validateUsername,
        },
    ],
};

export default validationRules;
