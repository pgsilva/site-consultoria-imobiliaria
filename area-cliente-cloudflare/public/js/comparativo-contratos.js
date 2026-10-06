(function () {
    'use strict';

    var form = document.getElementById('comparisonForm');
    if (!form) return;

    function digits(value) { return String(value || '').replace(/\D/g, ''); }
    function moneyFromDigits(value) {
        var number = Number(digits(value)) / 100;
        return number ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    }
    function moneyToNumber(value) { return Number(digits(value)) / 100; }
    function money(value) { return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    function rateNumber(value) { return Number(String(value || '').replace('%', '').replace(',', '.').trim()); }
    function rateText(value) { return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%'; }
    function percentageText(value) { return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
    function monthlyToAnnual(monthly) { return (Math.pow(1 + monthly / 100, 12) - 1) * 100; }
    function annualToMonthly(annual) { return (Math.pow(1 + annual / 100, 1 / 12) - 1) * 100; }

    function fields(index) {
        return {
            name: document.getElementById('contract' + index + 'Name'),
            principal: document.getElementById('contract' + index + 'Principal'),
            installments: document.getElementById('contract' + index + 'Installments'),
            payment: document.getElementById('contract' + index + 'Payment'),
            total: document.getElementById('contract' + index + 'Total'),
            monthlyRate: document.getElementById('contract' + index + 'MonthlyRate'),
            annualRate: document.getElementById('contract' + index + 'AnnualRate'),
            error: document.getElementById('contract' + index + 'Error')
        };
    }

    var contracts = [fields(1), fields(2)];
    var clientName = document.getElementById('clientName');
    var generatePdfButton = document.getElementById('generateComparisonPdf');
    var pdfMessage = document.getElementById('pdfMessage');
    var syncingRate = false;
    var latestComparison = null;

    function showPdfInBrowser(resultWindow, pdfBytes) {
        var pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        var document = resultWindow.document;
        document.title = 'Comparativo Premium';
        document.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;min-height:100vh;display:flex;flex-direction:column;background:#202124;font-family:Arial,sans-serif';

        var toolbar = document.createElement('div');
        toolbar.style.cssText = 'min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 18px;color:#fff;background:#001735';
        var title = document.createElement('strong');
        title.textContent = 'Comparativo Premium';
        var download = document.createElement('a');
        download.href = pdfUrl;
        download.download = 'comparativo-de-contratos-premium.pdf';
        download.textContent = 'Baixar PDF';
        download.style.cssText = 'padding:9px 14px;border-radius:999px;color:#001735;background:#e8b94a;font-size:13px;font-weight:700;text-decoration:none';
        toolbar.append(title, download);

        var viewer = document.createElement('iframe');
        viewer.title = 'PDF do comparativo de contratos';
        viewer.src = pdfUrl;
        viewer.style.cssText = 'width:100%;flex:1;border:0;background:#fff';
        document.body.append(toolbar, viewer);
        window.setTimeout(function () { URL.revokeObjectURL(pdfUrl); }, 300000);
    }

    function readContract(item, index) {
        var principal = moneyToNumber(item.principal.value);
        var installments = Math.max(0, Number(item.installments.value) || 0);
        var payment = moneyToNumber(item.payment.value);
        var informedTotal = moneyToNumber(item.total.value);
        var calculatedTotal = payment && installments ? payment * installments : 0;
        var total = informedTotal || calculatedTotal;
        var interest = principal && total ? total - principal : 0;
        var monthlyRate = rateNumber(item.monthlyRate.value) || 0;
        var annualRate = rateNumber(item.annualRate.value) || 0;
        var error = '';
        if (total && principal && total < principal) error = 'O valor total não pode ser menor que o valor contratado.';
        item.total.setCustomValidity(error);
        item.total.classList.toggle('input-error', Boolean(error));
        item.error.textContent = error;
        return {
            name: item.name.value.trim() || 'Contrato ' + index,
            principal: principal,
            installments: installments,
            payment: payment,
            total: total,
            interest: Math.max(0, interest),
            monthlyRate: monthlyRate,
            annualRate: annualRate,
            complete: principal > 0 && payment > 0 && total > 0 && (monthlyRate > 0 || annualRate > 0) && !error
        };
    }

    function barRow(label, value, maximum, formatted, second) {
        var row = document.createElement('div');
        row.className = 'chart-row' + (second ? ' contract-two-row' : '');
        var heading = document.createElement('div');
        heading.className = 'chart-label';
        var name = document.createElement('span');
        name.textContent = label;
        var amount = document.createElement('strong');
        amount.textContent = formatted;
        heading.append(name, amount);
        var track = document.createElement('div');
        track.className = 'bar-track';
        var fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = maximum > 0 ? Math.max(value > 0 ? 3 : 0, value / maximum * 100) + '%' : '0';
        track.setAttribute('role', 'img');
        track.setAttribute('aria-label', label + ': ' + formatted);
        track.appendChild(fill);
        row.append(heading, track);
        return row;
    }

    function renderChart(id, values, formatter) {
        var container = document.getElementById(id);
        var maximum = Math.max(values[0].value, values[1].value, 0);
        container.innerHTML = '';
        values.forEach(function (entry, index) {
            container.appendChild(barRow(entry.name, entry.value, maximum, formatter(entry.value), index === 1));
        });
    }

    function updateResults() {
        var first = readContract(contracts[0], 1);
        var second = readContract(contracts[1], 2);
        document.getElementById('metricName1').textContent = first.name;
        document.getElementById('metricName2').textContent = second.name;
        document.getElementById('metricTotal1').textContent = money(first.total);
        document.getElementById('metricTotal2').textContent = money(second.total);
        document.getElementById('metricInterest1').textContent = money(first.interest);
        document.getElementById('metricInterest2').textContent = money(second.interest);

        renderChart('paymentChart', [{ name: first.name, value: first.payment }, { name: second.name, value: second.payment }], money);
        renderChart('interestChart', [{ name: first.name, value: first.interest }, { name: second.name, value: second.interest }], money);
        renderChart('rateChart', [{ name: first.name, value: first.annualRate }, { name: second.name, value: second.annualRate }], rateText);

        var summary = document.getElementById('comparisonSummary');
        var best = document.getElementById('bestContract');
        var saving = document.getElementById('estimatedSaving');
        if (!first.complete || !second.complete) {
            latestComparison = null;
            generatePdfButton.disabled = true;
            pdfMessage.textContent = '';
            summary.textContent = 'Preencha os dois contratos para visualizar a comparação completa.';
            best.textContent = '—';
            saving.textContent = 'Preencha os valores para comparar.';
            return;
        }

        if (Math.abs(first.total - second.total) < 0.01) {
            best.textContent = 'Mesmo custo';
            saving.textContent = 'Os totais informados são equivalentes.';
        } else {
            var winner = first.total < second.total ? first : second;
            var difference = Math.abs(first.total - second.total);
            best.textContent = winner.name;
            saving.textContent = 'Economia estimada de ' + money(difference) + '.';
        }
        latestComparison = window.PremiumContractComparisonPdf.calculate({
            clientName: clientName.value,
            current: first,
            proposed: second,
            createdAt: new Date()
        });
        generatePdfButton.disabled = false;
        pdfMessage.textContent = '';
        if (latestComparison.monthlySaving >= 0) {
            summary.textContent = 'A troca reduz a parcela em ' + money(latestComparison.monthlySaving) + ' por mês (' + percentageText(latestComparison.installmentReduction) + ') e representa ' + money(latestComparison.annualSaving) + ' em 12 meses. A taxa do novo contrato é ' + rateText(second.annualRate) + ' ao ano.';
        } else {
            summary.textContent = 'O novo contrato aumenta a parcela em ' + money(Math.abs(latestComparison.monthlySaving)) + ' por mês. Revise a taxa, o prazo, o valor liberado e o custo total antes de recomendar a troca.';
        }
    }

    contracts.forEach(function (item) {
        item.name.addEventListener('input', updateResults);
        [item.principal, item.payment, item.total].forEach(function (input) {
            input.addEventListener('input', function (event) { event.target.value = moneyFromDigits(event.target.value); updateResults(); });
        });
        item.installments.addEventListener('input', updateResults);
        item.monthlyRate.addEventListener('input', function () {
            if (syncingRate) return;
            syncingRate = true;
            var monthly = rateNumber(item.monthlyRate.value);
            item.annualRate.value = Number.isFinite(monthly) && monthly > 0 ? monthlyToAnnual(monthly).toFixed(4).replace('.', ',') : '';
            syncingRate = false;
            updateResults();
        });
        item.annualRate.addEventListener('input', function () {
            if (syncingRate) return;
            syncingRate = true;
            var annual = rateNumber(item.annualRate.value);
            item.monthlyRate.value = Number.isFinite(annual) && annual > 0 ? annualToMonthly(annual).toFixed(4).replace('.', ',') : '';
            syncingRate = false;
            updateResults();
        });
    });

    clientName.addEventListener('input', updateResults);

    generatePdfButton.addEventListener('click', async function () {
        if (!latestComparison || !window.PremiumContractComparisonPdf) return;
        var resultWindow = window.open('', '_blank');
        if (!resultWindow) {
            pdfMessage.textContent = 'Permita a abertura de uma nova aba para visualizar o PDF.';
            return;
        }
        resultWindow.document.title = 'Preparando comparativo...';
        resultWindow.document.body.innerHTML = '<p style="font:16px Arial;padding:24px">Preparando o comparativo...</p>';
        generatePdfButton.disabled = true;
        pdfMessage.textContent = 'Gerando o comparativo...';
        try {
            var pdfBytes = await window.PremiumContractComparisonPdf.createPdfBytes(latestComparison);
            showPdfInBrowser(resultWindow, pdfBytes);
            pdfMessage.textContent = 'Comparativo aberto em uma nova aba.';
        } catch (error) {
            resultWindow.close();
            pdfMessage.textContent = error && error.message ? error.message : 'Não foi possível gerar o PDF.';
        } finally {
            generatePdfButton.disabled = !latestComparison;
        }
    });

    document.getElementById('clearComparison').addEventListener('click', function () {
        form.reset();
        contracts[0].name.value = 'Situação atual';
        contracts[1].name.value = 'Novo CGI';
        clientName.value = '';
        updateResults();
    });

    updateResults();
})();
