(function () {
    'use strict';

    var form = document.getElementById('simulationForm');
    if (!form) return;

    var propertyType = document.getElementById('tipoImovel');
    var propertyValue = document.getElementById('valorImovel');
    var calculationMode = document.getElementById('calculoPor');
    var calculationValueLabel = document.getElementById('calculationValueLabel');
    var financedValue = document.getElementById('valorFinanciado');
    var birthDate = document.getElementById('nascimento');
    var term = document.getElementById('prazo');
    var phone = document.getElementById('telefone');
    var financeHelp = document.getElementById('financeHelp');
    var termHelp = document.getElementById('termHelp');
    var formMessage = document.getElementById('formMessage');
    var rateSelect = document.getElementById('taxa');
    var residentialRates = [
        { value: '11.45', label: '11,45% a.a. — Funcionário I' },
        { value: '11.70', label: '11,70% a.a. — Funcionário II' },
        { value: '11.70', label: '11,70% a.a. — Principal I' },
        { value: '11.90', label: '11,90% a.a. — Principal II' },
        { value: '12.30', label: '12,30% a.a. — Prime I' },
        { value: '12.45', label: '12,45% a.a. — Prime II' }
    ];
    var expensesRatio = 0.05;

    function showPdfInBrowser(resultWindow, pdfBytes) {
        var pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        var document = resultWindow.document;
        document.title = 'Simulação Premium';
        document.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;min-height:100vh;display:flex;flex-direction:column;background:#202124;font-family:Arial,sans-serif';

        var toolbar = document.createElement('div');
        toolbar.style.cssText = 'min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 18px;color:#fff;background:#001735';
        var title = document.createElement('strong');
        title.textContent = 'Simulação Premium';
        var download = document.createElement('a');
        download.href = pdfUrl;
        download.download = 'simulacao-premium.pdf';
        download.textContent = 'Baixar PDF';
        download.style.cssText = 'padding:9px 14px;border-radius:999px;color:#001735;background:#e8b94a;font-size:13px;font-weight:700;text-decoration:none';
        toolbar.append(title, download);

        var viewer = document.createElement('iframe');
        viewer.title = 'PDF da simulação';
        viewer.src = pdfUrl;
        viewer.style.cssText = 'width:100%;flex:1;border:0;background:#fff';
        document.body.append(toolbar, viewer);
        window.setTimeout(function () { URL.revokeObjectURL(pdfUrl); }, 300000);
    }

    function isCommercial() {
        return propertyType.value === 'Comercial';
    }

    function maximumTotalFinancingRatio() {
        return isCommercial() ? 0.70 : 0.80;
    }

    function productMaximumMonths() {
        return isCommercial() ? 240 : 420;
    }

    function isEntryCalculation() {
        return calculationMode.value === 'Valor da entrada';
    }

    function calculatedFinancedValue() {
        var propertyNumber = moneyToNumber(propertyValue.value);
        var informedValue = moneyToNumber(financedValue.value);
        return isEntryCalculation() ? propertyNumber - informedValue : informedValue;
    }

    function updateCalculationMode() {
        calculationValueLabel.textContent = isEntryCalculation() ? 'Valor da entrada' : 'Valor financiado';
        financedValue.placeholder = 'R$ 0,00';
    }

    function updateRateOptions() {
        var options = isCommercial()
            ? [{ value: '13.99', label: '13,99% a.a. — Comercial' }]
            : residentialRates;
        rateSelect.innerHTML = '';
        if (!isCommercial()) {
            var prompt = document.createElement('option');
            prompt.value = '';
            prompt.textContent = 'Selecione';
            rateSelect.appendChild(prompt);
        }
        options.forEach(function (rate) {
            var option = document.createElement('option');
            option.value = rate.value;
            option.textContent = rate.label;
            rateSelect.appendChild(option);
        });
        if (isCommercial()) rateSelect.value = '13.99';
    }

    function digits(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function moneyFromDigits(value) {
        var number = Number(digits(value)) / 100;
        return number ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    }

    function moneyToNumber(value) {
        return Number(digits(value)) / 100;
    }

    function maskMoney(event) {
        event.target.value = moneyFromDigits(event.target.value);
    }

    function maskPhone(event) {
        var value = digits(event.target.value).slice(0, 11);
        if (value.length > 10) {
            event.target.value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
        } else if (value.length > 6) {
            event.target.value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
        } else if (value.length > 2) {
            event.target.value = value.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
        } else {
            event.target.value = value.replace(/^(\d*)/, '($1');
        }
    }

    function updateFinancing() {
        var value = moneyToNumber(propertyValue.value);
        financedValue.disabled = value < 100000;
        if (value < 100000) {
            financedValue.value = '';
            financedValue.setCustomValidity('');
            financedValue.classList.remove('input-error');
            financeHelp.classList.remove('field-error');
            financeHelp.textContent = 'Informe um imóvel a partir de R$ 100.000,00';
        } else {
            validateFinancingLimit();
        }
    }

    function validateFinancingLimit() {
        var propertyNumber = moneyToNumber(propertyValue.value);
        var informedNumber = moneyToNumber(financedValue.value);
        var hasInformedValue = digits(financedValue.value).length > 0;
        var calculatedFinancing = calculatedFinancedValue();
        var includesExpenses = selected('despesas') === 'Sim';
        var expensesValue = includesExpenses ? propertyNumber * expensesRatio : 0;
        var maximumRatio = maximumTotalFinancingRatio();
        var maximumBaseRatio = maximumRatio - (includesExpenses ? expensesRatio : 0);
        var maximumCombinedRatio = maximumRatio;
        var maximum = Math.round(propertyNumber * maximumBaseRatio * 100) / 100;
        var maximumTotal = Math.round(propertyNumber * maximumCombinedRatio * 100) / 100;
        var maximumPercent = Math.round(maximumCombinedRatio * 100);
        var exceedsLimit = hasInformedValue && maximum > 0 && calculatedFinancing > maximum;
        var invalidEntry = hasInformedValue && isEntryCalculation() && informedNumber >= propertyNumber;

        if (exceedsLimit || invalidEntry) {
            var minimumEntry = Math.round((propertyNumber - maximum) * 100) / 100;
            var errorText;
            if (invalidEntry) {
                errorText = 'A entrada deve ser menor que o valor do imóvel.';
            } else if (isEntryCalculation()) {
                errorText = 'Entrada mínima permitida: ' + minimumEntry.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '. O financiamento não pode ultrapassar ' + maximum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '.';
            } else {
                errorText = includesExpenses
                    ? 'Máximo permitido para o financiamento: ' + maximum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '. Com as custas de ' + expensesValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ', o total não pode ultrapassar ' + maximumTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '.'
                    : 'Máximo permitido: ' + maximum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' (' + maximumPercent + '% do valor do imóvel). Digite outro valor.';
            }
            financedValue.setCustomValidity(errorText);
            financedValue.classList.add('input-error');
            financeHelp.classList.add('field-error');
            financeHelp.textContent = errorText;
        } else if (propertyNumber >= 100000) {
            financedValue.setCustomValidity('');
            financedValue.classList.remove('input-error');
            financeHelp.classList.remove('field-error');
            if (isEntryCalculation() && hasInformedValue) {
                financeHelp.textContent = 'Valor financiado para o cálculo: ' + calculatedFinancing.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '.';
            } else if (isEntryCalculation()) {
                var minimumEntry = Math.round((propertyNumber - maximum) * 100) / 100;
                financeHelp.textContent = 'Entrada mínima: ' + minimumEntry.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '.';
            } else {
                financeHelp.textContent = includesExpenses
                    ? 'Financiamento máximo: ' + maximum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' + custas de ' + expensesValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' (total de ' + maximumPercent + '% do imóvel).'
                    : 'Financiamento máximo: ' + maximum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + ' (' + maximumPercent + '% do imóvel).';
            }
        }
        return !exceedsLimit && !invalidEntry;
    }

    function maskDate(event) {
        var value = digits(event.target.value).slice(0, 8);
        if (value.length > 4) {
            event.target.value = value.slice(0, 2) + '/' + value.slice(2, 4) + '/' + value.slice(4);
        } else if (value.length > 2) {
            event.target.value = value.slice(0, 2) + '/' + value.slice(2);
        } else {
            event.target.value = value;
        }
    }

    function parseBirthDate(value) {
        var valueDigits = digits(value);
        if (valueDigits.length !== 8) return null;
        var day = Number(valueDigits.slice(0, 2));
        var month = Number(valueDigits.slice(2, 4));
        var year = Number(valueDigits.slice(4));
        var parsed = new Date(year, month - 1, day, 12, 0, 0);
        if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
        return parsed;
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
        var today = new Date();
        var limit = new Date(born);
        limit.setFullYear(limit.getFullYear() + 80);
        var months = (limit.getFullYear() - today.getFullYear()) * 12 + (limit.getMonth() - today.getMonth());
        if (limit.getDate() < today.getDate()) months--;
        return Math.min(productMaximumMonths(), Math.max(0, months));
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
            term.removeAttribute('max');
            term.setCustomValidity('');
            term.classList.remove('input-error');
            termHelp.classList.remove('field-error');
            birthDate.setCustomValidity(age < 18 ? 'O proponente deve ter pelo menos 18 anos.' : 'O financiamento não pode ultrapassar os 80 anos do proponente.');
            termHelp.textContent = age < 18 ? 'O proponente deve ter pelo menos 18 anos.' : 'Não há prazo disponível para esta data de nascimento.';
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
        if (exceedsLimit) {
            var errorText = 'Prazo máximo permitido: ' + maximumMonths + ' meses. Digite outro prazo.';
            term.setCustomValidity(errorText);
            term.classList.add('input-error');
            termHelp.classList.add('field-error');
            termHelp.textContent = errorText;
        } else {
            term.setCustomValidity('');
            term.classList.remove('input-error');
            termHelp.classList.remove('field-error');
            if (maximumMonths) termHelp.textContent = 'Prazo máximo permitido: ' + maximumMonths + ' meses.';
        }
        return !exceedsLimit;
    }

    function selected(name) {
        var item = form.querySelector('[name="' + name + '"]:checked');
        return item ? item.value : '';
    }

    propertyValue.addEventListener('input', function (event) {
        maskMoney(event);
        updateFinancing();
    });
    financedValue.addEventListener('input', function (event) {
        maskMoney(event);
        validateFinancingLimit();
    });
    calculationMode.addEventListener('change', function () {
        financedValue.value = '';
        updateCalculationMode();
        updateFinancing();
    });
    birthDate.addEventListener('input', function (event) {
        maskDate(event);
        updateTerm();
    });
    term.addEventListener('input', validateTermLimit);
    phone.addEventListener('input', maskPhone);
    form.querySelectorAll('[name="despesas"]').forEach(function (option) {
        option.addEventListener('change', validateFinancingLimit);
    });
    propertyType.addEventListener('change', function () {
        updateRateOptions();
        updateFinancing();
        updateTerm();
    });

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        formMessage.textContent = '';
        updateTerm();
        var termWithinLimit = validateTermLimit();
        var financingWithinLimit = validateFinancingLimit();

        var propertyNumber = moneyToNumber(propertyValue.value);
        var financedNumber = calculatedFinancedValue();
        var includesExpenses = selected('despesas') === 'Sim';
        var maximumRatio = maximumTotalFinancingRatio();
        var maximumBaseRatio = maximumRatio - (includesExpenses ? expensesRatio : 0);
        var maximumFinancingNumber = Math.round(propertyNumber * maximumBaseRatio * 100) / 100;
        if (!financingWithinLimit) {
            financedValue.focus();
            return;
        }
        if (!termWithinLimit) {
            term.focus();
            return;
        }
        if (!form.checkValidity()) {
            formMessage.textContent = 'Confira os campos obrigatórios antes de continuar.';
            form.reportValidity();
            return;
        }
        if (propertyNumber < 100000) {
            formMessage.textContent = 'O valor mínimo do imóvel é R$ 100.000,00.';
            propertyValue.focus();
            return;
        }
        if (financedNumber <= 0 || financedNumber > maximumFinancingNumber) {
            formMessage.textContent = includesExpenses
                ? 'Com as custas incluídas, o financiamento deve respeitar o limite de ' + Math.round(maximumBaseRatio * 100) + '% do valor do imóvel.'
                : 'O valor financiado deve ser maior que zero e respeitar o limite de ' + Math.round(maximumRatio * 100) + '% do valor do imóvel.';
            financedValue.focus();
            return;
        }
        if (digits(phone.value).length < 10) {
            formMessage.textContent = 'Informe um telefone válido, incluindo o DDD.';
            phone.focus();
            return;
        }
        if (!window.PremiumSimulationPdf) {
            formMessage.textContent = 'Não foi possível carregar o gerador da simulação. Atualize a página e tente novamente.';
            return;
        }

        var resultWindow = window.open('', '_blank');
        if (!resultWindow) {
            formMessage.textContent = 'Permita a abertura de uma nova aba para visualizar o PDF da simulação.';
            return;
        }
        resultWindow.document.title = 'Gerando simulação';
        resultWindow.document.body.innerHTML = '<p style="font:16px Arial,sans-serif;padding:32px;color:#001735">Gerando sua simulação em PDF...</p>';

        var fields = new FormData(form);
        var rate = Number(String(fields.get('taxa')).replace('% ao ano', '').replace(',', '.').trim());

        try {
            var result = window.PremiumSimulationPdf.calculate({
                name: String(fields.get('nome')).trim(),
                email: String(fields.get('email')).trim(),
                phone: String(fields.get('telefone')).trim(),
                propertyType: String(fields.get('tipoImovel')),
                propertyValue: propertyNumber,
                financedValue: financedNumber,
                birthDate: parseBirthDate(String(fields.get('nascimento'))),
                termMonths: Number(fields.get('prazo')),
                annualRate: rate,
                simulationDate: new Date(),
                expenses: selected('despesas')
            });
            var pdfBytes = await window.PremiumSimulationPdf.createPdfBytes(result);
            showPdfInBrowser(resultWindow, pdfBytes);
        } catch (error) {
            resultWindow.close();
            formMessage.textContent = 'Não foi possível gerar o PDF. Atualize a página e tente novamente.';
            console.error(error);
        }
    });

    updateRateOptions();
    updateCalculationMode();
    updateFinancing();
    updateTerm();
})();
