// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import i18n from 'i18n';

const validationPatterns = {
    validatePasswordLength: {
        pattern: /^(?=.{8,256}$)/,
        message: i18n.t('common:validation.passwordLength'),
    },

    passwordContainsNumericCharacters: {
        pattern: /(?=.*[0-9])/,
        message: i18n.t('common:validation.passwordNumeric'),
    },

    passwordContainsUpperCaseCharacter: {
        pattern: /(?=.*[A-Z])/,
        message: i18n.t('common:validation.passwordUppercase'),
    },

    passwordContainsLowerCaseCharacter: {
        pattern: /(?=.*[a-z])/,
        message: i18n.t('common:validation.passwordLowercase'),
    },

    validateUsernameLength: {
        pattern: /^.{5,150}$/u,
        message: i18n.t('common:validation.usernameLength'),
    },

    validateUsernameCharacters: {
        pattern: /^[\p{L}\p{N}_@.+-]+$/u,
        message: i18n.t('common:validation.usernameCharacters'),
    },

    /*
        \p{Pd} - dash connectors
        \p{Pc} - connector punctuations
        \p{Cf} - invisible formatting indicator
        \p{L} - any alphabetic character
        Useful links:
        https://stackoverflow.com/questions/4323386/multi-language-input-validation-with-utf-8-encoding
        https://stackoverflow.com/questions/280712/javascript-unicode-regexes
        https://stackoverflow.com/questions/6377407/how-to-validate-both-chinese-unicode-and-english-name
    */
    validateName: {

        pattern: /^(\p{L}|\p{Pd}|\p{Cf}|\p{Pc}|['\s]){2,}$/gu,
        message: i18n.t('common:validation.invalidName'),
    },

    validateAttributeName: {
        pattern: /\S+/,
        message: i18n.t('common:validation.invalidName'),
    },

    validateLabelName: {
        pattern: /\S+/,
        message: i18n.t('common:validation.invalidName'),
    },

    validateAttributeValue: {
        pattern: /\S+/,
        message: i18n.t('common:validation.invalidAttributeValue'),
    },

    validateURL: {

        pattern: /^(https?:\/\/)[^\s$.?#].[^\s]*$/, // url, ip
        message: i18n.t('common:validation.invalidUrl'),
    },

    validateOrganizationSlug: {
        pattern: /^[a-zA-Z\d]+$/,
        message: i18n.t('common:validation.latinCharactersAndNumbersOnly'),
    },

    validatePhoneNumber: {
        pattern: /^[+]*[-\s0-9]*$/g,
        message: i18n.t('common:validation.invalidPhoneNumber'),
    },
};

export default validationPatterns;
