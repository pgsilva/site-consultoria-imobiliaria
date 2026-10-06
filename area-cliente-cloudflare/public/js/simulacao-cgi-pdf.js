(function (global) {
    'use strict';

    var IOF_ADDITIONAL_RATE = 0.0038;
    var IOF_DAILY_RATE = 0.000082;
    var IOF_MAX_DAYS = 365;
    var MAX_LTV = 0.60;
    var MAX_TERM_MONTHS = 240;
    var INCOME_COMMITMENT = 0.30;

    function roundMoney(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function addMonths(date, months) {
        var result = new Date(date.getFullYear(), date.getMonth() + months, date.getDate(), 12, 0, 0);
        if (result.getDate() !== date.getDate()) result.setDate(0);
        return result;
    }

    function daysBetween(start, end) {
        return Math.max(0, Math.round((end - start) / 86400000));
    }

    function npv(rate, flows) {
        return flows.reduce(function (total, value, index) {
            return total + value / Math.pow(1 + rate, index);
        }, 0);
    }

    function irr(flows) {
        var low = 0;
        var high = 0.15;
        for (var index = 0; index < 200; index++) {
            var middle = (low + high) / 2;
            if (npv(middle, flows) > 0) high = middle;
            else low = middle;
        }
        return (low + high) / 2;
    }

    function calculateSacRows(input, monthlyRate) {
        var amortization = roundMoney(input.financedValue / input.termMonths);
        var balance = roundMoney(input.financedValue);
        var rows = [];
        for (var number = 1; number <= input.termMonths; number++) {
            var openingBalance = balance;
            var actualAmortization = number === input.termMonths ? openingBalance : amortization;
            var interest = roundMoney(openingBalance * monthlyRate);
            var payment = roundMoney(actualAmortization + interest);
            balance = roundMoney(Math.max(0, openingBalance - actualAmortization));
            rows.push({
                number: number,
                date: addMonths(input.simulationDate, number),
                amortization: actualAmortization,
                interest: interest,
                tariff: 0,
                payment: payment,
                balance: balance
            });
        }
        return rows;
    }

    function calculatePriceRows(input, monthlyRate) {
        var fixedPayment = monthlyRate === 0
            ? input.financedValue / input.termMonths
            : input.financedValue * monthlyRate / (1 - Math.pow(1 + monthlyRate, -input.termMonths));
        var balance = roundMoney(input.financedValue);
        var rows = [];
        for (var number = 1; number <= input.termMonths; number++) {
            var interest = roundMoney(balance * monthlyRate);
            var amortization = number === input.termMonths ? balance : roundMoney(fixedPayment - interest);
            var payment = roundMoney(amortization + interest);
            balance = roundMoney(Math.max(0, balance - amortization));
            rows.push({
                number: number,
                date: addMonths(input.simulationDate, number),
                amortization: amortization,
                interest: interest,
                tariff: 0,
                payment: payment,
                balance: balance
            });
        }
        return rows;
    }

    function calculateIof(financedValue, rows, simulationDate) {
        var variableIof = rows.reduce(function (total, row) {
            var taxableDays = Math.min(IOF_MAX_DAYS, daysBetween(simulationDate, row.date));
            return total + row.amortization * taxableDays * IOF_DAILY_RATE;
        }, 0);
        return roundMoney(financedValue * IOF_ADDITIONAL_RATE + variableIof);
    }

    function calculateSimulation(input) {
        if (!input || input.modality !== 'Crédito com garantia de imóvel') throw new Error('Modalidade de CGI inválida.');
        if (['Bradesco', 'Santander'].indexOf(input.bank) < 0) throw new Error('CGI disponível apenas para Bradesco e Santander.');
        if (input.financedValue <= 0 || input.propertyValue <= 0) throw new Error('Informe os valores do imóvel e do crédito.');
        if (roundMoney(input.financedValue) > roundMoney(input.propertyValue * MAX_LTV)) throw new Error('O crédito não pode ultrapassar 60% do valor do imóvel.');
        if (input.termMonths < 1 || input.termMonths > MAX_TERM_MONTHS) throw new Error('O prazo do CGI deve ficar entre 1 e 240 meses.');
        if (input.bank === 'Bradesco' && input.financedValue < 50000) throw new Error('O crédito mínimo do Credimóvel Bradesco é R$ 50.000,00.');
        if (input.bank === 'Santander' && input.financedValue < 30000) throw new Error('O crédito mínimo do Usecasa Santander é R$ 30.000,00.');
        if (input.bank === 'Santander') input.amortizationSystem = 'Price';
        if (['SAC', 'Price'].indexOf(input.amortizationSystem) < 0) throw new Error('Sistema de amortização inválido.');

        var annualRate = input.annualRate / 100;
        var monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
        var installmentRows = input.amortizationSystem === 'Price'
            ? calculatePriceRows(input, monthlyRate)
            : calculateSacRows(input, monthlyRate);
        var initialFee = roundMoney(input.initialFee || 0);
        var rows = [{
            number: 0,
            date: input.simulationDate,
            amortization: 0,
            interest: 0,
            tariff: initialFee,
            payment: initialFee,
            balance: input.financedValue
        }].concat(installmentRows);
        var iof = calculateIof(input.financedValue, installmentRows, input.simulationDate);
        var firstPayment = installmentRows[0].payment;
        var totalInstallments = installmentRows.reduce(function (total, row) { return total + row.payment; }, 0);
        var flows = [input.financedValue - iof - initialFee]
            .concat(installmentRows.map(function (row) { return -row.payment; }));
        var monthlyCet = irr(flows);

        return {
            input: input,
            rows: rows,
            monthlyRate: monthlyRate,
            nominalAnnualRate: monthlyRate * 12 * 100,
            ltv: input.financedValue / input.propertyValue * 100,
            iof: iof,
            initialFee: initialFee,
            firstPayment: firstPayment,
            lastPayment: installmentRows[installmentRows.length - 1].payment,
            minimumIncome: firstPayment / INCOME_COMMITMENT,
            totalInstallments: totalInstallments,
            totalCost: totalInstallments + iof + initialFee,
            cet: (Math.pow(1 + monthlyCet, 12) - 1) * 100
        };
    }

    function money(value) {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function percent(value, digits) {
        return value.toLocaleString('pt-BR', { minimumFractionDigits: digits || 2, maximumFractionDigits: digits || 2 }) + '%';
    }

    function dateText(date) {
        return date.toLocaleDateString('pt-BR');
    }

    function fitText(text, font, maxWidth, size) {
        var result = String(text);
        while (font.widthOfTextAtSize(result, size) > maxWidth && result.length > 4) result = result.slice(0, -4) + '...';
        return result;
    }

    function wrapText(text, font, size, maxWidth) {
        var words = String(text).split(/\s+/);
        var lines = [];
        var current = '';
        words.forEach(function (word) {
            var candidate = current ? current + ' ' + word : word;
            if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
            else {
                if (current) lines.push(current);
                current = word;
            }
        });
        if (current) lines.push(current);
        return lines;
    }

    async function createPdfBytes(result) {
        if (!global.PDFLib) throw new Error('Biblioteca de PDF indisponível.');
        var PDFDocument = global.PDFLib.PDFDocument;
        var StandardFonts = global.PDFLib.StandardFonts;
        var rgb = global.PDFLib.rgb;
        var document = await PDFDocument.create();
        var regular = await document.embedFont(StandardFonts.Helvetica);
        var bold = await document.embedFont(StandardFonts.HelveticaBold);
        var brand = await document.embedFont(StandardFonts.TimesRomanBold);
        var heroImage = global.PremiumSimulationAssets && global.PremiumSimulationAssets.hero
            ? await document.embedJpg(global.PremiumSimulationAssets.hero) : null;
        var logoImage = global.PremiumSimulationAssets && global.PremiumSimulationAssets.logo
            ? await document.embedPng(global.PremiumSimulationAssets.logo) : null;
        var pageSize = [842, 595];
        var navy = rgb(0.01, 0.10, 0.21);
        var gold = rgb(0.91, 0.70, 0.24);
        var ink = rgb(0.12, 0.15, 0.19);
        var muted = rgb(0.38, 0.43, 0.51);
        var pale = rgb(0.97, 0.96, 0.92);
        var ivory = rgb(0.99, 0.98, 0.95);
        var line = rgb(0.85, 0.77, 0.57);
        var pages = [];

        document.setTitle('Simulação de crédito com garantia de imóvel - Premium Assessoria Imobiliária');
        document.setAuthor('Premium Assessoria Imobiliária');
        document.setSubject('Simulação estimada de crédito com garantia de imóvel');

        function drawCenteredText(page, text, font, size, centerX, y, color, maxWidth) {
            var value = maxWidth ? fitText(text, font, maxWidth, size) : String(text);
            page.drawText(value, { x: centerX - font.widthOfTextAtSize(value, size) / 2, y: y, size: size, font: font, color: color });
        }

        function newPage(sectionTitle) {
            var page = document.addPage(pageSize);
            pages.push(page);
            if (heroImage) page.drawImage(heroImage, { x: 0, y: 507, width: 842, height: 88 });
            page.drawRectangle({ x: 0, y: 507, width: 842, height: 88, color: navy, opacity: heroImage ? 0.88 : 1 });
            page.drawRectangle({ x: 0, y: 503, width: 842, height: 4, color: gold });
            if (logoImage) page.drawImage(logoImage, { x: 28, y: 511, width: 105, height: 80 });
            else {
                page.drawText('PREMIUM', { x: 36, y: 550, size: 22, font: brand, color: gold });
                page.drawText('ASSESSORIA IMOBILIÁRIA', { x: 36, y: 534, size: 8.3, font: bold, color: rgb(1, 1, 1) });
            }
            if (sectionTitle) drawCenteredText(page, sectionTitle, bold, 11, 660, 541, rgb(1, 1, 1), 285);
            return page;
        }

        function drawMetricRow(page, items, y) {
            var margin = 66;
            var gap = 6;
            var width = (842 - margin * 2 - gap * (items.length - 1)) / items.length;
            items.forEach(function (item, index) {
                var x = margin + index * (width + gap);
                page.drawRectangle({ x: x, y: y, width: width, height: 38, color: ivory, borderColor: line, borderWidth: 0.55 });
                drawCenteredText(page, item.label, bold, 6.4, x + width / 2, y + 25, muted, width - 10);
                drawCenteredText(page, item.value, bold, 9.1, x + width / 2, y + 9, navy, width - 10);
            });
        }

        var page = newPage('');
        drawCenteredText(page, 'Simulação de crédito com garantia - ' + result.input.bank, bold, 19, 421, 466, navy, 710);
        page.drawRectangle({ x: 66, y: 352, width: 710, height: 88, color: pale, borderColor: gold, borderWidth: 0.8 });
        drawCenteredText(page, 'INFORMAÇÕES IMPORTANTES', bold, 8.5, 421, 421, navy, 300);
        var notice = 'Esta é apenas uma simulação e não representa aprovação de crédito. Os valores são estimados. Taxa, IOF, tarifa de avaliação, despesas cartorárias, CET e demais condições dependem da análise do banco, do cliente e do imóvel. O imóvel será alienado fiduciariamente e o atraso pode levar à perda da garantia. Confirme a proposta oficial antes da contratação.';
        var noticeLines = wrapText(notice, bold, 7.8, 670);
        noticeLines.forEach(function (lineText, index) { drawCenteredText(page, lineText, bold, 7.8, 421, 401 - index * 10.5, navy, 670); });

        drawCenteredText(page, 'DADOS DO CLIENTE', bold, 8.5, 421, 333, navy, 300);
        page.drawRectangle({ x: 66, y: 297, width: 710, height: 27, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.55 });
        drawCenteredText(page, result.input.name, bold, 10.2, 184, 306, ink, 215);
        drawCenteredText(page, result.input.email, regular, 8, 421, 307, muted, 230);
        drawCenteredText(page, result.input.phone, regular, 8, 658, 307, muted, 200);

        drawMetricRow(page, [
            { label: 'BANCO', value: result.input.bank },
            { label: 'TIPO DE IMÓVEL', value: result.input.propertyType },
            { label: 'SISTEMA', value: result.input.amortizationSystem },
            { label: 'PRAZO', value: result.input.termMonths + ' meses' }
        ], 243);
        drawMetricRow(page, [
            { label: 'VALOR DO IMÓVEL', value: money(result.input.propertyValue) },
            { label: 'VALOR DO CRÉDITO', value: money(result.input.financedValue) },
            { label: 'PERCENTUAL DO IMÓVEL', value: percent(result.ltv) },
            { label: 'TAXA EFETIVA', value: percent(result.input.annualRate, 4) + ' a.a.' }
        ], 197);
        drawMetricRow(page, [
            { label: 'IOF ESTIMADO', value: money(result.iof) },
            { label: 'TARIFA INICIAL', value: money(result.initialFee) },
            { label: 'PRIMEIRA PARCELA', value: money(result.firstPayment) },
            { label: 'ÚLTIMA PARCELA', value: money(result.lastPayment) }
        ], 151);
        drawMetricRow(page, [
            { label: 'CET ESTIMADO', value: percent(result.cet) + ' a.a.' },
            { label: 'TAXA NOMINAL ESTIMADA', value: percent(result.nominalAnnualRate, 4) + ' a.a.' },
            { label: 'RENDA MÍNIMA ESTIMADA', value: money(result.minimumIncome) },
            { label: 'TOTAL PARCELAS', value: money(result.totalInstallments) }
        ], 105);

        drawCenteredText(page, 'CRITÉRIOS UTILIZADOS', bold, 8.5, 421, 80, navy, 300);
        var bankCriteria = result.input.bank === 'Bradesco'
            ? 'No Credimóvel Bradesco, a taxa é fixa e não há seguro obrigatório segundo a página oficial consultada.'
            : 'No Usecasa Santander, foi usada a Tabela Price por se tratar de parcelas fixas; custos adicionais devem ser confirmados na proposta.';
        var criteria = 'Crédito limitado a 60% do valor do imóvel e prazo máximo de 240 meses. Juros calculados sobre o saldo devedor pelo sistema ' + result.input.amortizationSystem + '. IOF estimado em 0,38% adicional mais 0,0082% ao dia sobre cada amortização, limitado a 365 dias. ' + bankCriteria;
        var criteriaLines = wrapText(criteria, regular, 7.2, 680);
        criteriaLines.slice(0, 4).forEach(function (lineText, index) { drawCenteredText(page, lineText, regular, 7.2, 421, 64 - index * 9, muted, 680); });

        var columns = [
            { label: 'Parcela', width: 55, key: 'number' },
            { label: 'Data', width: 86, key: 'date' },
            { label: 'Amortização', width: 118, key: 'amortization' },
            { label: 'Juros', width: 105, key: 'interest' },
            { label: 'Tarifa', width: 90, key: 'tariff' },
            { label: 'Valor parcela', width: 145, key: 'payment', main: true },
            { label: 'Saldo devedor', width: 171, key: 'balance' }
        ];
        var rowsPerPage = 15;
        for (var offset = 0; offset < result.rows.length; offset += rowsPerPage) {
            var chunk = result.rows.slice(offset, offset + rowsPerPage);
            page = newPage('EVOLUÇÃO DAS PARCELAS');
            var x = 36;
            var y = 443;
            columns.forEach(function (column) {
                page.drawRectangle({ x: x, y: y, width: column.width, height: 28, color: navy });
                drawCenteredText(page, column.label, bold, 9.1, x + column.width / 2, y + 9.5, column.main ? gold : rgb(1, 1, 1), column.width - 8);
                x += column.width;
            });
            y -= 26;
            chunk.forEach(function (row, rowIndex) {
                x = 36;
                page.drawRectangle({ x: x, y: y, width: 770, height: 26, color: rowIndex % 2 === 0 ? rgb(1, 1, 1) : ivory });
                columns.forEach(function (column) {
                    var value;
                    if (column.key === 'number') value = String(row.number);
                    else if (column.key === 'date') value = dateText(row.date);
                    else value = money(roundMoney(row[column.key]));
                    drawCenteredText(page, value, column.main ? bold : regular, 9.8, x + column.width / 2, y + 8.2, column.main ? navy : ink, column.width - 8);
                    x += column.width;
                });
                y -= 26;
            });
            if (offset + rowsPerPage >= result.rows.length) {
                page.drawRectangle({ x: 36, y: y - 4, width: 770, height: 24, color: pale, borderColor: gold, borderWidth: 0.5 });
                drawCenteredText(page, 'TOTAL ESTIMADO DAS PARCELAS: ' + money(result.totalInstallments), bold, 8.8, 421, y + 4, navy, 740);
            }
        }

        pages.forEach(function (item, index) {
            item.drawText('Premium Assessoria Imobiliária - Simulação de CGI sem garantia de aprovação. Leia a página 1.', { x: 36, y: 15, size: 6.5, font: regular, color: muted });
            item.drawText('Página ' + (index + 1) + ' de ' + pages.length, { x: 742, y: 15, size: 6.5, font: regular, color: muted });
        });
        return document.save();
    }

    global.PremiumCgiPdf = {
        calculate: calculateSimulation,
        createPdfBytes: createPdfBytes,
        constants: {
            iofAdditionalRate: IOF_ADDITIONAL_RATE,
            iofDailyRate: IOF_DAILY_RATE,
            iofMaxDays: IOF_MAX_DAYS,
            maximumLtv: MAX_LTV,
            maximumTermMonths: MAX_TERM_MONTHS
        }
    };
}(typeof window !== 'undefined' ? window : globalThis));
