(function (global) {
    'use strict';

    var MONTHLY_DFI_RATE = 0.000055;
    var INITIAL_TSA = 2114.03;
    var CONDITIONAL_MONTHLY_TSA = 25;
    var INCOME_COMMITMENT = 0.30;
    var CESH_DISCOUNT = 1.008;
    var EXPENSES_RATIO = 0.05;

    var MIP_RATES = [
        { maxAge: 32, rate: 0.00014375 },
        { maxAge: 35, rate: 0.00015680 },
        { maxAge: 38, rate: 0.00018141 },
        { maxAge: 41, rate: 0.00022370 },
        { maxAge: 44, rate: 0.00031693 },
        { maxAge: 47, rate: 0.00043522 },
        { maxAge: 50, rate: 0.00058717 },
        { maxAge: 53, rate: 0.00075998 },
        { maxAge: 56, rate: 0.00093586 },
        { maxAge: 59, rate: 0.00113066 },
        { maxAge: 62, rate: 0.00138229 },
        { maxAge: 65, rate: 0.00178171 },
        { maxAge: 68, rate: 0.00253337 },
        { maxAge: 71, rate: 0.00349524 },
        { maxAge: 74, rate: 0.00434162 },
        { maxAge: 77, rate: 0.00819408 },
        { maxAge: 80, rate: 0.01152128 }
    ];

    function roundMoney(value) {
        return Math.round((value + Number.EPSILON) * 100) / 100;
    }

    function addMonths(date, months) {
        var result = new Date(date.getFullYear(), date.getMonth() + months, date.getDate(), 12, 0, 0);
        if (result.getDate() !== date.getDate()) result.setDate(0);
        return result;
    }

    function ageAtDate(birthDate, date) {
        var age = date.getFullYear() - birthDate.getFullYear();
        var month = date.getMonth() - birthDate.getMonth();
        if (month < 0 || (month === 0 && date.getDate() < birthDate.getDate())) age--;
        return age;
    }

    function mipRateForAge(age) {
        for (var index = 0; index < MIP_RATES.length; index++) {
            if (age <= MIP_RATES[index].maxAge) return MIP_RATES[index].rate;
        }
        return MIP_RATES[MIP_RATES.length - 1].rate;
    }

    function npv(rate, flows) {
        return flows.reduce(function (total, value, index) {
            return total + value / Math.pow(1 + rate, index);
        }, 0);
    }

    function irr(flows) {
        var low = 0;
        var high = 0.1;
        for (var index = 0; index < 180; index++) {
            var middle = (low + high) / 2;
            if (npv(middle, flows) > 0) high = middle;
            else low = middle;
        }
        return (low + high) / 2;
    }

    function calculateCesh(rows, financedValue, simulationDate) {
        var presentValue = rows.reduce(function (total, row) {
            var days = Math.max(0, Math.round((row.date - simulationDate) / 86400000));
            var discount = Math.pow(CESH_DISCOUNT, (12 * days) / 365);
            return total + (row.mip + row.dfi) / discount;
        }, 0);
        return (presentValue / financedValue) * 100;
    }

    function calculateSimulation(input) {
        var annualRate = input.annualRate / 100;
        var monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
        var monthlyTsa = input.annualRate < 12 ? CONDITIONAL_MONTHLY_TSA : 0;
        var expensesValue = input.expenses === 'Sim' ? input.propertyValue * EXPENSES_RATIO : 0;
        var totalFinancedValue = input.financedValue + expensesValue;
        var isCommercial = input.propertyType === 'Comercial';
        var maximumTotalFinanced = roundMoney(input.propertyValue * (isCommercial ? 0.70 : 0.80));
        if (roundMoney(totalFinancedValue) > maximumTotalFinanced) {
            throw new Error('O financiamento e as custas ultrapassam o limite do valor do imóvel.');
        }
        if (isCommercial && input.termMonths > 240) {
            throw new Error('O prazo máximo para imóvel comercial é de 240 meses.');
        }
        if (isCommercial && Math.abs(input.annualRate - 13.99) > 0.001) {
            throw new Error('A taxa para imóvel comercial deve ser de 13,99% a.a.');
        }
        var ageLimitDate = new Date(input.birthDate);
        ageLimitDate.setFullYear(ageLimitDate.getFullYear() + 80);
        if (addMonths(input.simulationDate, input.termMonths) > ageLimitDate) {
            throw new Error('O prazo do financiamento ultrapassa os 80 anos do proponente.');
        }
        var amortization = totalFinancedValue / input.termMonths;
        var dfi = input.propertyValue * MONTHLY_DFI_RATE;
        var initialAge = ageAtDate(input.birthDate, input.simulationDate);
        var initialMip = totalFinancedValue * mipRateForAge(initialAge);
        var rows = [{
            number: 0,
            date: input.simulationDate,
            amortization: 0,
            interest: 0,
            mip: initialMip,
            dfi: dfi,
            tsa: INITIAL_TSA,
            payment: initialMip + dfi,
            balance: totalFinancedValue
        }];

        for (var number = 1; number <= input.termMonths; number++) {
            var openingBalance = Math.max(0, totalFinancedValue - amortization * (number - 1));
            var actualAmortization = number === input.termMonths ? openingBalance : amortization;
            var closingBalance = Math.max(0, openingBalance - actualAmortization);
            var installmentDate = addMonths(input.simulationDate, number);
            var age = ageAtDate(input.birthDate, installmentDate);
            var interest = openingBalance * monthlyRate;
            var mip = number === input.termMonths ? 0 : closingBalance * mipRateForAge(age);
            var installmentDfi = number === input.termMonths ? 0 : dfi;
            var tsa = monthlyTsa;

            rows.push({
                number: number,
                date: installmentDate,
                amortization: actualAmortization,
                interest: interest,
                mip: mip,
                dfi: installmentDfi,
                tsa: tsa,
                payment: actualAmortization + interest + mip + installmentDfi + tsa,
                balance: closingBalance
            });
        }

        var firstPayment = rows[1].payment;
        var totalPayments = rows.reduce(function (total, row) { return total + row.payment; }, 0);
        var flows = [totalFinancedValue - INITIAL_TSA - rows[0].payment]
            .concat(rows.slice(1).map(function (row) { return -row.payment; }));
        var monthlyCet = irr(flows);

        return {
            input: input,
            rows: rows,
            monthlyRate: monthlyRate,
            expensesValue: expensesValue,
            totalFinancedValue: totalFinancedValue,
            entryValue: input.propertyValue - input.financedValue,
            firstPayment: firstPayment,
            lastPayment: rows[rows.length - 1].payment,
            minimumIncome: firstPayment / INCOME_COMMITMENT,
            totalPayments: totalPayments,
            totalWithTsa: totalPayments + INITIAL_TSA,
            cet: (Math.pow(1 + monthlyCet, 12) - 1) * 100,
            cesh: calculateCesh(rows, totalFinancedValue, input.simulationDate),
            initialTsa: INITIAL_TSA,
            monthlyTsa: monthlyTsa
        };
    }

    function money(value) {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function percent(value) {
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    }

    function dateText(date) {
        return date.toLocaleDateString('pt-BR');
    }

    function fitText(text, font, maxWidth, size) {
        var result = String(text);
        while (font.widthOfTextAtSize(result, size) > maxWidth && result.length > 4) {
            result = result.slice(0, -4) + '...';
        }
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

    function drawJustifiedText(page, text, font, size, x, y, maxWidth, lineHeight, color) {
        var lines = wrapText(text, font, size, maxWidth);
        lines.forEach(function (lineText, lineIndex) {
            var words = lineText.split(' ');
            var isLastLine = lineIndex === lines.length - 1;
            if (isLastLine || words.length < 2) {
                page.drawText(lineText, { x: x, y: y - lineIndex * lineHeight, size: size, font: font, color: color });
                return;
            }
            var wordsWidth = words.reduce(function (total, word) {
                return total + font.widthOfTextAtSize(word, size);
            }, 0);
            var gap = (maxWidth - wordsWidth) / (words.length - 1);
            var wordX = x;
            words.forEach(function (word) {
                page.drawText(word, { x: wordX, y: y - lineIndex * lineHeight, size: size, font: font, color: color });
                wordX += font.widthOfTextAtSize(word, size) + gap;
            });
        });
        return lines.length;
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
            ? await document.embedJpg(global.PremiumSimulationAssets.hero)
            : null;
        var logoImage = global.PremiumSimulationAssets && global.PremiumSimulationAssets.logo
            ? await document.embedPng(global.PremiumSimulationAssets.logo)
            : null;
        var pageSize = [842, 595];
        var navy = rgb(0.01, 0.10, 0.21);
        var gold = rgb(0.91, 0.70, 0.24);
        var ink = rgb(0.12, 0.15, 0.19);
        var muted = rgb(0.38, 0.43, 0.51);
        var pale = rgb(0.97, 0.96, 0.92);
        var ivory = rgb(0.99, 0.98, 0.95);
        var line = rgb(0.85, 0.77, 0.57);
        var pages = [];

        document.setTitle('Simulação de financiamento - Premium Assessoria Imobiliária');
        document.setAuthor('Premium Assessoria Imobiliária');
        document.setSubject('Simulação habitacional no sistema SAC');

        function newPage(sectionTitle) {
            var page = document.addPage(pageSize);
            pages.push(page);
            if (heroImage) page.drawImage(heroImage, { x: 0, y: 507, width: 842, height: 88 });
            page.drawRectangle({ x: 0, y: 507, width: 842, height: 88, color: navy, opacity: heroImage ? 0.88 : 1 });
            page.drawRectangle({ x: 0, y: 503, width: 842, height: 4, color: gold });
            if (logoImage) {
                page.drawImage(logoImage, { x: 28, y: 511, width: 105, height: 80 });
            } else {
                page.drawText('PREMIUM', { x: 36, y: 550, size: 22, font: brand, color: gold });
                page.drawText('ASSESSORIA IMOBILIÁRIA', { x: 36, y: 534, size: 8.3, font: bold, color: rgb(1, 1, 1) });
            }
            if (sectionTitle) drawCenteredText(page, sectionTitle, bold, 11, 660, 541, rgb(1, 1, 1), 285);
            return page;
        }

        function drawCenteredText(page, text, font, size, centerX, y, color, maxWidth) {
            var value = maxWidth ? fitText(text, font, maxWidth, size) : String(text);
            page.drawText(value, {
                x: centerX - font.widthOfTextAtSize(value, size) / 2,
                y: y,
                size: size,
                font: font,
                color: color
            });
        }

        function drawMetricRow(page, items, y) {
            var margin = 66;
            var gap = 6;
            var width = (842 - margin * 2 - gap * (items.length - 1)) / items.length;
            items.forEach(function (item, index) {
                var x = margin + index * (width + gap);
                page.drawRectangle({ x: x, y: y, width: width, height: 38, color: ivory, borderColor: line, borderWidth: 0.55 });
                drawCenteredText(page, item.label, bold, 6.4, x + width / 2, y + 25, muted, width - 10);
                drawCenteredText(page, item.value, bold, 9.2, x + width / 2, y + 9, navy, width - 10);
            });
        }

        var page = newPage('');
        drawCenteredText(page, 'Simulação de financiamento - Bradesco', bold, 20, 421, 466, navy, 710);

        var notices = [
            'Esta é apenas uma simulação e não representa aprovação de crédito. Os valores são estimados e podem sofrer alterações após a contratação. Taxas, seguros, tarifas e avaliação do imóvel estão sujeitos à análise e alteração pelo banco.',
            'A taxa de juros é aprovada individualmente por CPF, considerando a análise do banco e o relacionamento do cliente com a instituição, podendo ser menor ou maior que a apresentada nesta simulação. Para verificar as condições aplicáveis ao seu caso, fale com nossa equipe.',
            'Não está incluída a correção pela TR (Taxa Referencial). Após o registro do contrato, a planilha financeira deverá ser solicitada ao banco ou à assessoria.'
        ];
        page.drawRectangle({ x: 66, y: 342, width: 710, height: 98, color: pale, borderColor: gold, borderWidth: 0.8 });
        var importantTitle = 'INFORMAÇÕES IMPORTANTES';
        drawCenteredText(page, importantTitle, bold, 8.5, 421, 421, navy, 300);
        page.drawText('1', {
            x: 421 + bold.widthOfTextAtSize(importantTitle, 8.5) / 2 + 2,
            y: 426,
            size: 5.5,
            font: bold,
            color: navy
        });
        drawJustifiedText(page, notices.join(' '), bold, 7.8, 86, 402, 670, 10.5, navy);

        drawCenteredText(page, 'DADOS DO CLIENTE', bold, 8.5, 421, 323, navy, 300);
        page.drawRectangle({ x: 66, y: 287, width: 710, height: 27, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.55 });
        drawCenteredText(page, result.input.name, bold, 10.2, 184, 296, ink, 215);
        drawCenteredText(page, result.input.email, regular, 8, 421, 297, muted, 230);
        drawCenteredText(page, result.input.phone, regular, 8, 658, 297, muted, 200);

        drawMetricRow(page, [
            { label: 'TIPO DE IMOVEL', value: result.input.propertyType },
            { label: 'SISTEMA', value: 'SAC' },
            { label: 'PRAZO', value: result.input.termMonths + ' meses' },
            { label: 'TAXA EFETIVA', value: percent(result.input.annualRate) + ' a.a.' }
        ], 233);
        drawMetricRow(page, [
            { label: 'VALOR DO IMOVEL', value: money(result.input.propertyValue) },
            { label: 'VALOR FINANCIADO', value: money(result.input.financedValue) },
            { label: 'CET ESTIMADO', value: percent(result.cet) + ' a.a.' },
            { label: 'CESH ESTIMADO', value: percent(result.cesh) }
        ], 187);
        drawMetricRow(page, [
            { label: 'PRIMEIRA PARCELA', value: money(result.firstPayment) },
            { label: 'ULTIMA PARCELA', value: money(result.lastPayment) },
            { label: 'RENDA MINIMA ESTIMADA', value: money(result.minimumIncome) },
            { label: 'TARIFA INICIAL (TSA)', value: money(result.initialTsa) }
        ], 141);

        drawCenteredText(page, 'CRITÉRIOS UTILIZADOS', bold, 8.5, 421, 116, navy, 300);
        var expensesCriteria = result.input.expenses === 'Sim'
            ? 'Sim, no valor de ' + money(result.expensesValue) + ' (5% do valor do imóvel).'
            : 'Não.';
        var criteriaText = 'A simulação utiliza o sistema SAC, com amortização constante e juros calculados sobre o saldo devedor. O MIP é estimado por faixa etária e o DFI corresponde a 0,0055% ao mês sobre o valor do imóvel. A renda mínima considera comprometimento de 30%. Despesas no financiamento: ' + expensesCriteria + ' O CET inclui parcelas, seguros, TSA inicial e, para taxas abaixo de 12% a.a., TSA mensal de R$ 25,00; o CESH considera os seguros MIP e DFI.';
        var criteriaLines = wrapText(criteriaText, regular, 7.4, 680);
        criteriaLines.forEach(function (lineText, index) {
            drawCenteredText(page, lineText, regular, 7.4, 421, 98 - index * 10, muted, 680);
        });

        var columns = [
            { label: 'Parcela', width: 55, key: 'number' },
            { label: 'Amortização', width: 105, key: 'amortization' },
            { label: 'Juros', width: 90, key: 'interest' },
            { label: 'Seguro MIP', width: 90, key: 'mip' },
            { label: 'Seguro DFI', width: 85, key: 'dfi' },
            { label: 'TSA', width: 85, key: 'tsa' },
            { label: 'Valor parcela', width: 120, key: 'payment', main: true },
            { label: 'Saldo devedor', width: 140, key: 'balance' }
        ];
        var rowsPerPage = 15;
        for (var offset = 0; offset < result.rows.length; offset += rowsPerPage) {
            var chunk = result.rows.slice(offset, offset + rowsPerPage);
            page = newPage('EVOLUÇÃO DAS PARCELAS');
            var x = 36;
            var y = 443;
            columns.forEach(function (column) {
                page.drawRectangle({ x: x, y: y, width: column.width, height: 28, color: navy });
                drawCenteredText(page, column.label, bold, 9.2, x + column.width / 2, y + 9.5, column.main ? gold : rgb(1, 1, 1), column.width - 8);
                x += column.width;
            });
            y -= 26;
            chunk.forEach(function (row, rowIndex) {
                x = 36;
                var background = (rowIndex % 2 === 0) ? rgb(1, 1, 1) : ivory;
                page.drawRectangle({ x: x, y: y, width: 770, height: 26, color: background });
                columns.forEach(function (column) {
                    var value = column.key === 'number' ? String(row.number) : money(roundMoney(row[column.key]));
                    drawCenteredText(page, value, column.main ? bold : regular, 10.2, x + column.width / 2, y + 8.2, column.main ? navy : ink, column.width - 8);
                    x += column.width;
                });
                y -= 26;
            });
            if (offset + rowsPerPage >= result.rows.length) {
                page.drawRectangle({ x: 36, y: y - 4, width: 770, height: 24, color: pale, borderColor: gold, borderWidth: 0.5 });
                drawCenteredText(page, 'TOTAL ESTIMADO DAS PARCELAS E SEGUROS: ' + money(result.totalPayments), bold, 8.8, 421, y + 4, navy, 740);
            }
        }

        pages.forEach(function (item, index) {
            item.drawText('Premium Assessoria Imobiliária - Simulação sem garantia de aprovação. Leia informações importantes na página 1.', { x: 36, y: 15, size: 6.5, font: regular, color: muted });
            item.drawText('Página ' + (index + 1) + ' de ' + pages.length, { x: 742, y: 15, size: 6.5, font: regular, color: muted });
        });

        return document.save();
    }

    global.PremiumSimulationPdf = {
        calculate: calculateSimulation,
        createPdfBytes: createPdfBytes,
        constants: {
            monthlyDfiRate: MONTHLY_DFI_RATE,
            initialTsa: INITIAL_TSA,
            conditionalMonthlyTsa: CONDITIONAL_MONTHLY_TSA,
            incomeCommitment: INCOME_COMMITMENT
        }
    };
}(typeof window !== 'undefined' ? window : globalThis));
