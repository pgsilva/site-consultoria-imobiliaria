(function () {
    'use strict';

    var form = document.getElementById('simulationForm');
    if (!form) return;

    var modality = document.getElementById('modalidade');
    var propertyType = document.getElementById('tipoImovel');
    var propertyValue = document.getElementById('valorImovel');
    var propertyHelp = document.getElementById('propertyHelp');
    var calculationMode = document.getElementById('calculoPor');
    var calculationValueLabel = document.getElementById('calculationValueLabel');
    var financedValue = document.getElementById('valorFinanciado');
    var birthDate = document.getElementById('nascimento');
    var operationDateField = document.getElementById('operationDateField');
    var operationDateInput = document.getElementById('dataOperacao');
    var firstDueDateField = document.getElementById('firstDueDateField');
    var firstDueDateInput = document.getElementById('primeiroVencimento');
    var firstDueDateHelp = document.getElementById('firstDueDateHelp');
    var term = document.getElementById('prazo');
    var termLabel = document.getElementById('termLabel');
    var amortization = document.getElementById('amortizacao');
    var amortizationHelp = document.getElementById('amortizationHelp');
    var phone = document.getElementById('telefone');
    var financeHelp = document.getElementById('financeHelp');
    var termHelp = document.getElementById('termHelp');
    var formMessage = document.getElementById('formMessage');
    var rateInput = document.getElementById('taxa');
    var rateLabel = document.getElementById('rateLabel');
    var rateIntro = document.getElementById('rateIntro');
    var rateHelp = document.getElementById('rateHelp');
    var expensesField = document.getElementById('expensesField');
    var initialFeeField = document.getElementById('initialFeeField');
    var initialFee = document.getElementById('tarifaInicial');
    var initialFeeHelp = document.getElementById('initialFeeHelp');
    var bankHelp = document.getElementById('bankHelp');
    var bankBradesco = document.getElementById('bankBradesco');
    var bankSantander = document.getElementById('bankSantander');
    var expensesRatio = 0.05;

    function showPdfInBrowser(resultWindow, pdfBytes) {
        var pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        resultWindow.location.replace(pdfUrl);
    }

    function isCgi() { return modality.value === 'Crédito com garantia de imóvel'; }
    function selected(name) {
        var item = form.querySelector('[name="' + name + '"]:checked');
        return item ? item.value : '';
    }
    function selectedBank() { return selected('banco') || 'Bradesco'; }
    function isCommercial() { return propertyType.value === 'Comercial'; }
    function maximumTotalFinancingRatio() { return isCgi() ? 0.60 : (isCommercial() ? 0.70 : 0.80); }
    function productMaximumMonths() { return isCgi() ? 240 : (isCommercial() ? 240 : 420); }
    function minimumCreditValue() { return !isCgi() ? 0 : (selectedBank() === 'Santander' ? 30000 : 50000); }
    function minimumPropertyValue() { return isCgi() ? 1 : 100000; }
    function isEntryCalculation() { return !isCgi() && calculationMode.value === 'Valor da entrada'; }
    function calculatedFinancedValue() {
        var propertyNumber = moneyToNumber(propertyValue.value);
        var informedValue = moneyToNumber(financedValue.value);
        return isEntryCalculation() ? propertyNumber - informedValue : informedValue;
    }
    function parseRate(value) { return Number(String(value || '').replace('%', '').replace(',', '.').trim()); }
    function validateRate() {
        var rate = parseRate(rateInput.value);
        var valid = Number.isFinite(rate) && rate > 0 && rate < 100;
        rateInput.setCustomValidity(valid ? '' : 'Digite uma taxa anual válida. Exemplo: 12,30.');
        rateInput.classList.toggle('input-error', rateInput.value.length > 0 && !valid);
        return valid;
    }
    function digits(value) { return String(value || '').replace(/\D/g, ''); }
    function moneyFromDigits(value) {
        var number = Number(digits(value)) / 100;
        return number ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    }
    function moneyToNumber(value) { return Number(digits(value)) / 100; }
    function moneyText(value) { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    function maskMoney(event) { event.target.value = moneyFromDigits(event.target.value); }
    function maskPhone(event) {
        var value = digits(event.target.value).slice(0, 11);
        if (value.length > 10) event.target.value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
        else if (value.length > 6) event.target.value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
        else if (value.length > 2) event.target.value = value.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
        else event.target.value = value.replace(/^(\d*)/, '($1');
    }
    function maskDate(event) {
        var value = digits(event.target.value).slice(0, 8);
        if (value.length > 4) event.target.value = value.slice(0, 2) + '/' + value.slice(2, 4) + '/' + value.slice(4);
        else if (value.length > 2) event.target.value = value.slice(0, 2) + '/' + value.slice(2);
        else event.target.value = value;
    }
    function parseCalendarDate(value) {
        var valueDigits = digits(value);
        if (valueDigits.length !== 8) return null;
        var day = Number(valueDigits.slice(0, 2));
        var month = Number(valueDigits.slice(2, 4));
        var year = Number(valueDigits.slice(4));
        var parsed = new Date(year, month - 1, day, 12, 0, 0);
        if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
        return parsed;
    }
    function parseBirthDate(value) { return parseCalendarDate(value); }
    function dateInputText(date) {
        return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + date.getFullYear();
    }
    function todayAtNoon() {
        var now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    }
    function addCalendarMonths(date, months) {
        var result = new Date(date.getFullYear(), date.getMonth() + months, date.getDate(), 12, 0, 0);
        if (result.getDate() !== date.getDate()) result.setDate(0);
        return result;
    }
    function updateCgiDates(forceDefaults) {
        var active = isCgi();
        operationDateField.classList.toggle('is-hidden', !active);
        firstDueDateField.classList.toggle('is-hidden', !active);
        operationDateInput.disabled = !active;
        firstDueDateInput.disabled = !active;
        operationDateInput.required = active;
        firstDueDateInput.required = active;
        if (active && (forceDefaults || !parseCalendarDate(operationDateInput.value))) {
            var today = todayAtNoon();
            operationDateInput.value = dateInputText(today);
            firstDueDateInput.value = dateInputText(addCalendarMonths(today, 1));
        }
        if (!active) {
            operationDateInput.setCustomValidity('');
            firstDueDateInput.setCustomValidity('');
        }
        validateCgiDates();
    }
    function validateCgiDates() {
        if (!isCgi()) return true;
        var operationDate = parseCalendarDate(operationDateInput.value);
        var firstDueDate = parseCalendarDate(firstDueDateInput.value);
        operationDateInput.setCustomValidity(operationDate ? '' : 'Informe uma data da operação válida.');
        var errorText = '';
        if (!firstDueDate) errorText = 'Informe uma data de primeiro vencimento válida.';
        else if (operationDate && firstDueDate <= operationDate) errorText = 'O primeiro vencimento deve ser posterior à data da operação.';
        firstDueDateInput.setCustomValidity(errorText);
        firstDueDateInput.classList.toggle('input-error', Boolean(errorText));
        firstDueDateHelp.classList.toggle('field-error', Boolean(errorText));
        if (errorText) firstDueDateHelp.textContent = errorText;
        else if (operationDate && firstDueDate) {
            var calendarDays = Math.round((firstDueDate - operationDate) / 86400000);
            firstDueDateHelp.textContent = 'Primeiro período: ' + calendarDays + ' dias corridos; juros proporcionais por ' + Math.max(1, calendarDays - 1) + ' dias.';
        }
        return Boolean(operationDate && firstDueDate && !errorText);
    }
    function ageFromBirthDate(born) {
        var today = new Date();
        var age = today.getFullYear() - born.getFullYear();
        var month = today.getMonth() - born.getMonth();
        if (month < 0 || (month === 0 && today.getDate() < born.getDate())) age--;
        return age;
    }
    function maximumTermMonths(born) {
        if (!born) return 0;
        if (isCgi()) return productMaximumMonths();
        var today = new Date();
        var limit = new Date(born);
        limit.setFullYear(limit.getFullYear() + 80);
        var months = (limit.getFullYear() - today.getFullYear()) * 12 + (limit.getMonth() - today.getMonth());
        if (limit.getDate() < today.getDate()) months--;
        return Math.min(productMaximumMonths(), Math.max(0, months));
    }
    function replaceOptions(select, options, chosen) {
        select.innerHTML = '';
        options.forEach(function (item) {
            var option = document.createElement('option');
            option.value = item;
            option.textContent = item;
            select.appendChild(option);
        });
        if (chosen && options.indexOf(chosen) >= 0) select.value = chosen;
    }
    function updatePropertyOptions() {
        Array.from(propertyType.options).forEach(function (option) { option.disabled = false; });
        if (!isCgi()) return;
        var bank = selectedBank();
        Array.from(propertyType.options).forEach(function (option) {
            option.disabled = option.value === 'Terreno' || (bank === 'Bradesco' && option.value === 'Comercial');
        });
        if (propertyType.selectedOptions[0] && propertyType.selectedOptions[0].disabled) propertyType.value = 'Residencial';
    }
    function updateAmortizationOptions() {
        if (!isCgi()) {
            replaceOptions(amortization, ['SAC'], 'SAC');
            amortization.disabled = false;
            amortizationHelp.textContent = 'Sistema usado no financiamento imobiliário.';
        } else if (selectedBank() === 'Santander') {
            replaceOptions(amortization, ['Price'], 'Price');
            amortization.disabled = true;
            amortizationHelp.textContent = 'O Usecasa foi configurado com parcelas fixas (Tabela Price).';
        } else {
            replaceOptions(amortization, ['SAC', 'Price'], amortization.value || 'SAC');
            amortization.disabled = false;
            amortizationHelp.textContent = 'O Credimóvel Bradesco admite SAC e Price.';
        }
    }
    function updateCalculationMode() {
        if (isCgi()) {
            calculationMode.value = 'Valor do financiamento';
            calculationMode.disabled = true;
            calculationValueLabel.textContent = 'Valor do crédito';
        } else {
            calculationMode.disabled = false;
            calculationValueLabel.textContent = isEntryCalculation() ? 'Valor da entrada' : 'Valor financiado';
        }
        financedValue.placeholder = 'R$ 0,00';
    }
    function updateBankAvailability() {
        bankSantander.disabled = !isCgi();
        var santanderLabel = form.querySelector('label[for="bankSantander"]');
        if (isCgi()) santanderLabel.removeAttribute('aria-disabled');
        else santanderLabel.setAttribute('aria-disabled', 'true');
        if (!isCgi() && bankSantander.checked) bankBradesco.checked = true;
        bankHelp.textContent = isCgi()
            ? 'CGI disponível para Bradesco e Santander. Itaú e Inter permanecem em preparação.'
            : 'No financiamento imobiliário, o teste permanece disponível apenas para o Bradesco.';
    }
    function updateRateAndFee(forceDefault) {
        var bank = selectedBank();
        rateLabel.textContent = 'Taxa do ' + bank;
        rateIntro.textContent = 'Informe a taxa efetiva anual usada na simulação do ' + bank + '.';
        if (isCgi()) {
            rateHelp.textContent = bank === 'Bradesco'
                ? 'Informe a taxa efetiva anual aprovada na proposta do Bradesco.'
                : 'Taxa editável. Confirme a condição aprovada na proposta do Santander.';
            if (forceDefault) rateInput.value = bank === 'Bradesco' ? '23,4771' : '14,30';
            initialFeeField.classList.remove('is-hidden');
            if (bank === 'Bradesco') {
                if (forceDefault) initialFee.value = 'R$ 2.114,03';
                initialFeeHelp.textContent = 'Valor do benchmark Bradesco; altere conforme a proposta.';
            } else {
                if (forceDefault) initialFee.value = '';
                initialFeeHelp.textContent = 'Informe a tarifa indicada na proposta Santander, se houver.';
            }
        } else {
            rateHelp.textContent = 'Digite livremente a taxa anual que será usada no cálculo. É possível reduzir a taxa com relacionamento na instituição.';
            if (forceDefault) rateInput.value = isCommercial() ? '13,99' : '12,30';
            initialFeeField.classList.add('is-hidden');
        }
        validateRate();
    }
    function updateProduct(forceDefaults) {
        updateBankAvailability();
        updatePropertyOptions();
        updateAmortizationOptions();
        updateCalculationMode();
        updateCgiDates(forceDefaults);
        expensesField.classList.toggle('is-hidden', isCgi());
        termLabel.textContent = isCgi() ? 'Prazo da operação' : 'Prazo de financiamento';
        if (isCgi()) form.querySelector('[name="despesas"][value="Não"]').checked = true;
        propertyHelp.textContent = isCgi()
            ? 'O crédito pode chegar a 60% do valor de avaliação do imóvel.'
            : 'Valor mínimo: R$ 100.000,00';
        updateRateAndFee(forceDefaults);
        updateFinancing();
        updateTerm();
    }
    function updateFinancing() {
        var value = moneyToNumber(propertyValue.value);
        financedValue.disabled = value < minimumPropertyValue();
        if (value < minimumPropertyValue()) {
            financedValue.value = '';
            financedValue.setCustomValidity('');
            financedValue.classList.remove('input-error');
            financeHelp.classList.remove('field-error');
            financeHelp.textContent = isCgi() ? 'Informe o valor de avaliação do imóvel.' : 'Informe um imóvel a partir de R$ 100.000,00';
        } else validateFinancingLimit();
    }
    function validateFinancingLimit() {
        var propertyNumber = moneyToNumber(propertyValue.value);
        var informedNumber = moneyToNumber(financedValue.value);
        var hasInformedValue = digits(financedValue.value).length > 0;
        var calculatedFinancing = calculatedFinancedValue();
        var includesExpenses = !isCgi() && selected('despesas') === 'Sim';
        var expensesValue = includesExpenses ? propertyNumber * expensesRatio : 0;
        var maximumRatio = maximumTotalFinancingRatio();
        var maximumBaseRatio = maximumRatio - (includesExpenses ? expensesRatio : 0);
        var maximum = Math.round(propertyNumber * maximumBaseRatio * 100) / 100;
        var maximumTotal = Math.round(propertyNumber * maximumRatio * 100) / 100;
        var exceedsLimit = hasInformedValue && maximum > 0 && calculatedFinancing > maximum;
        var belowMinimum = isCgi() && hasInformedValue && calculatedFinancing < minimumCreditValue();
        var invalidEntry = hasInformedValue && isEntryCalculation() && informedNumber >= propertyNumber;
        var errorText = '';
        if (invalidEntry) errorText = 'A entrada deve ser menor que o valor do imóvel.';
        else if (belowMinimum) errorText = 'Crédito mínimo para ' + selectedBank() + ': ' + moneyText(minimumCreditValue()) + '.';
        else if (exceedsLimit && isCgi()) errorText = 'Crédito máximo permitido: ' + moneyText(maximum) + ' (60% do valor do imóvel).';
        else if (exceedsLimit && isEntryCalculation()) errorText = 'Entrada mínima permitida: ' + moneyText(propertyNumber - maximum) + '. O financiamento não pode ultrapassar ' + moneyText(maximum) + '.';
        else if (exceedsLimit && includesExpenses) errorText = 'Máximo permitido para o financiamento: ' + moneyText(maximum) + '. Com as custas de ' + moneyText(expensesValue) + ', o total não pode ultrapassar ' + moneyText(maximumTotal) + '.';
        else if (exceedsLimit) errorText = 'Máximo permitido: ' + moneyText(maximum) + ' (' + Math.round(maximumRatio * 100) + '% do valor do imóvel). Digite outro valor.';
        financedValue.setCustomValidity(errorText);
        financedValue.classList.toggle('input-error', Boolean(errorText));
        financeHelp.classList.toggle('field-error', Boolean(errorText));
        if (errorText) financeHelp.textContent = errorText;
        else if (propertyNumber >= minimumPropertyValue()) {
            if (isCgi()) financeHelp.textContent = 'Limite estimado: ' + moneyText(maximum) + ' (60% do imóvel). Mínimo: ' + moneyText(minimumCreditValue()) + '.';
            else if (isEntryCalculation() && hasInformedValue) financeHelp.textContent = 'Valor financiado para o cálculo: ' + moneyText(calculatedFinancing) + '.';
            else if (isEntryCalculation()) financeHelp.textContent = 'Entrada mínima: ' + moneyText(propertyNumber - maximum) + '.';
            else financeHelp.textContent = includesExpenses
                ? 'Financiamento máximo: ' + moneyText(maximum) + ' + custas de ' + moneyText(expensesValue) + '.'
                : 'Financiamento máximo: ' + moneyText(maximum) + ' (' + Math.round(maximumRatio * 100) + '% do imóvel).';
        }
        return !errorText;
    }
    function updateTerm() {
        var born = parseBirthDate(birthDate.value);
        var age = born ? ageFromBirthDate(born) : 0;
        var maximumMonths = maximumTermMonths(born);
        if (!born) {
            term.disabled = true;
            term.value = '';
            term.removeAttribute('max');
            term.setCustomValidity('');
            term.classList.remove('input-error');
            termHelp.classList.remove('field-error');
            birthDate.setCustomValidity(birthDate.value ? 'Informe uma data de nascimento válida.' : '');
            termHelp.textContent = 'Digite a data no formato DD/MM/AAAA.';
            return;
        }
        if (age < 18 || maximumMonths < 1) {
            term.disabled = true;
            term.value = '';
            birthDate.setCustomValidity(age < 18 ? 'O proponente deve ter pelo menos 18 anos.' : 'Não há prazo disponível para esta data de nascimento.');
            termHelp.textContent = birthDate.validationMessage;
            return;
        }
        birthDate.setCustomValidity('');
        term.disabled = false;
        term.max = maximumMonths;
        validateTermLimit();
    }
    function validateTermLimit() {
        var maximumMonths = maximumTermMonths(parseBirthDate(birthDate.value));
        var exceedsLimit = maximumMonths && Number(term.value) > maximumMonths;
        var errorText = exceedsLimit ? 'Prazo máximo permitido: ' + maximumMonths + ' meses. Digite outro prazo.' : '';
        term.setCustomValidity(errorText);
        term.classList.toggle('input-error', Boolean(errorText));
        termHelp.classList.toggle('field-error', Boolean(errorText));
        if (errorText) termHelp.textContent = errorText;
        else if (maximumMonths) termHelp.textContent = 'Prazo máximo permitido: ' + maximumMonths + ' meses.';
        return !exceedsLimit;
    }

    propertyValue.addEventListener('input', function (event) { maskMoney(event); updateFinancing(); });
    financedValue.addEventListener('input', function (event) { maskMoney(event); validateFinancingLimit(); });
    initialFee.addEventListener('input', maskMoney);
    calculationMode.addEventListener('change', function () { financedValue.value = ''; updateCalculationMode(); updateFinancing(); });
    birthDate.addEventListener('input', function (event) { maskDate(event); updateTerm(); });
    operationDateInput.addEventListener('input', function (event) { maskDate(event); validateCgiDates(); });
    firstDueDateInput.addEventListener('input', function (event) { maskDate(event); validateCgiDates(); });
    term.addEventListener('input', validateTermLimit);
    phone.addEventListener('input', maskPhone);
    rateInput.addEventListener('input', validateRate);
    modality.addEventListener('change', function () { financedValue.value = ''; updateProduct(true); });
    propertyType.addEventListener('change', function () { updateFinancing(); updateTerm(); if (!isCgi()) updateRateAndFee(true); });
    form.querySelectorAll('[name="despesas"]').forEach(function (option) { option.addEventListener('change', validateFinancingLimit); });
    form.querySelectorAll('[name="banco"]').forEach(function (option) {
        option.addEventListener('change', function () {
            updatePropertyOptions();
            updateAmortizationOptions();
            updateRateAndFee(true);
            updateFinancing();
        });
    });

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        formMessage.textContent = '';
        updateTerm();
        var termWithinLimit = validateTermLimit();
        var financingWithinLimit = validateFinancingLimit();
        var rateIsValid = validateRate();
        var cgiDatesAreValid = validateCgiDates();
        if (!financingWithinLimit) { financedValue.focus(); return; }
        if (!termWithinLimit) { term.focus(); return; }
        if (!rateIsValid) { rateInput.focus(); return; }
        if (!cgiDatesAreValid) { firstDueDateInput.focus(); return; }
        if (!form.checkValidity()) {
            formMessage.textContent = 'Confira os campos obrigatórios antes de continuar.';
            form.reportValidity();
            return;
        }
        var fields = new FormData(form);
        var commonInput = {
            name: String(fields.get('nome')).trim(),
            email: String(fields.get('email')).trim(),
            phone: String(fields.get('telefone')).trim(),
            modality: modality.value,
            bank: selectedBank(),
            propertyType: propertyType.value,
            propertyValue: moneyToNumber(propertyValue.value),
            financedValue: calculatedFinancedValue(),
            birthDate: parseBirthDate(String(fields.get('nascimento'))),
            termMonths: Number(fields.get('prazo')),
            annualRate: parseRate(fields.get('taxa')),
            amortizationSystem: amortization.value,
            simulationDate: isCgi() ? parseCalendarDate(String(fields.get('dataOperacao'))) : new Date(),
            firstDueDate: isCgi() ? parseCalendarDate(String(fields.get('primeiroVencimento'))) : null,
            expenses: selected('despesas'),
            initialFee: moneyToNumber(initialFee.value)
        };
        var generator = isCgi() ? window.PremiumCgiPdf : window.PremiumSimulationPdf;
        if (!generator) {
            formMessage.textContent = 'Não foi possível carregar o gerador da simulação. Atualize a página e tente novamente.';
            return;
        }
        if (digits(phone.value).length < 10) {
            formMessage.textContent = 'Informe um telefone válido, incluindo o DDD.';
            phone.focus();
            return;
        }
        var resultWindow = window.open('', '_blank');
        if (!resultWindow) {
            formMessage.textContent = 'Permita a abertura de uma nova aba para visualizar o PDF da simulação.';
            return;
        }
        resultWindow.document.title = 'Gerando simulação';
        resultWindow.document.body.innerHTML = '<p style="font:16px Arial,sans-serif;padding:32px;color:#001735">Gerando sua simulação em PDF...</p>';
        try {
            var result = generator.calculate(commonInput);
            var pdfBytes = await generator.createPdfBytes(result);
            showPdfInBrowser(resultWindow, pdfBytes);
        } catch (error) {
            resultWindow.close();
            formMessage.textContent = error && error.message ? error.message : 'Não foi possível gerar o PDF. Atualize a página e tente novamente.';
            console.error(error);
        }
    });

    updateProduct(false);
})();
