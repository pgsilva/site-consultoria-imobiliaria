(function (global) {
    'use strict';

    function money(value) {
        return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function percent(value, digits) {
        return Number(value || 0).toLocaleString('pt-BR', {
            minimumFractionDigits: digits == null ? 2 : digits,
            maximumFractionDigits: digits == null ? 2 : digits
        }) + '%';
    }

    function calculate(input) {
        if (!input || !input.current || !input.proposed) throw new Error('Informe os dois contratos.');
        var current = input.current;
        var proposed = input.proposed;
        if (!current.complete || !proposed.complete) throw new Error('Preencha os dados necessários dos dois contratos.');
        var monthlySaving = current.payment - proposed.payment;
        var annualSaving = monthlySaving * 12;
        var installmentReduction = current.payment ? monthlySaving / current.payment * 100 : 0;
        return {
            clientName: String(input.clientName || '').trim() || 'Cliente',
            current: current,
            proposed: proposed,
            monthlySaving: monthlySaving,
            annualSaving: annualSaving,
            installmentReduction: installmentReduction,
            annualRateDifference: current.annualRate - proposed.annualRate,
            totalDifference: current.total - proposed.total,
            interestDifference: current.interest - proposed.interest,
            createdAt: input.createdAt || new Date()
        };
    }

    function fitText(text, font, maxWidth, size) {
        var value = String(text);
        while (font.widthOfTextAtSize(value, size) > maxWidth && value.length > 4) value = value.slice(0, -4) + '...';
        return value;
    }

    function wrapText(text, font, size, maxWidth) {
        var lines = [];
        var current = '';
        String(text).split(/\s+/).forEach(function (word) {
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
        var navy = rgb(0.01, 0.10, 0.21);
        var gold = rgb(0.91, 0.70, 0.24);
        var ink = rgb(0.12, 0.15, 0.19);
        var muted = rgb(0.38, 0.43, 0.51);
        var ivory = rgb(0.99, 0.98, 0.95);
        var pale = rgb(0.97, 0.96, 0.92);
        var line = rgb(0.85, 0.77, 0.57);
        var white = rgb(1, 1, 1);
        var page;

        document.setTitle('Estudo comparativo de contratos - Premium Assessoria Imobiliária');
        document.setAuthor('Premium Assessoria Imobiliária');
        document.setSubject('Comparação entre situação financeira atual e novo contrato');

        function centered(text, font, size, centerX, y, color, maxWidth) {
            var value = maxWidth ? fitText(text, font, maxWidth, size) : String(text);
            page.drawText(value, { x: centerX - font.widthOfTextAtSize(value, size) / 2, y: y, size: size, font: font, color: color });
        }

        function drawHeader(compact) {
            var height = compact ? 72 : 94;
            var bottom = 842 - height;
            if (heroImage) page.drawImage(heroImage, { x: 0, y: bottom, width: 595, height: height });
            page.drawRectangle({ x: 0, y: bottom, width: 595, height: height, color: navy, opacity: heroImage ? 0.9 : 1 });
            page.drawRectangle({ x: 0, y: bottom - 4, width: 595, height: 4, color: gold });
            if (logoImage) page.drawImage(logoImage, { x: compact ? 24 : 22, y: bottom + 6, width: compact ? 74 : 90, height: compact ? 60 : 82 });
            else {
                page.drawText('PREMIUM', { x: 28, y: bottom + 48, size: 20, font: brand, color: gold });
                page.drawText('ASSESSORIA IMOBILIÁRIA', { x: 28, y: bottom + 33, size: 7.5, font: bold, color: white });
            }
        }

        function drawFooter(pageNumber, totalPages) {
            page.drawText('Premium Assessoria Imobiliária - Comparativo sem garantia de aprovação.', { x: 43, y: 25, size: 7.2, font: regular, color: muted });
            page.drawText('Página ' + pageNumber + ' de ' + totalPages, { x: 503, y: 25, size: 7.2, font: regular, color: muted });
        }

        function drawMetricCard(x, y, label, value, highlighted) {
            page.drawRectangle({ x: x, y: y, width: 246, height: 50, color: highlighted ? pale : ivory, borderColor: line, borderWidth: 0.7 });
            centered(label, bold, 7.4, x + 123, y + 33, muted, 226);
            centered(value, bold, 12.5, x + 123, y + 13, highlighted ? navy : ink, 226);
        }

        function drawChartBlock(y, title, subtitle, currentValue, proposedValue, formatter) {
            var x = 43;
            var width = 509;
            var max = Math.max(currentValue, proposedValue, 0);
            page.drawRectangle({ x: x, y: y, width: width, height: 160, color: white, borderColor: line, borderWidth: 0.7 });
            page.drawText(title, { x: x + 18, y: y + 132, size: 12, font: bold, color: navy });
            page.drawText(subtitle, { x: x + 18, y: y + 115, size: 8.2, font: regular, color: muted });

            [
                { label: result.current.name, value: currentValue, color: navy },
                { label: result.proposed.name, value: proposedValue, color: gold }
            ].forEach(function (item, index) {
                var rowY = y + 77 - index * 48;
                var ratio = max > 0 ? item.value / max : 0;
                var barWidth = max > 0 ? Math.max(item.value > 0 ? 4 : 0, ratio * 473) : 0;
                page.drawText(fitText(item.label, bold, 205, 8.8), { x: x + 18, y: rowY + 18, size: 8.8, font: bold, color: ink });
                var formatted = formatter(item.value);
                page.drawText(formatted, { x: x + width - 18 - bold.widthOfTextAtSize(formatted, 9), y: rowY + 18, size: 9, font: bold, color: item.color });
                page.drawRectangle({ x: x + 18, y: rowY, width: 473, height: 11, color: rgb(0.92, 0.93, 0.95) });
                page.drawRectangle({ x: x + 18, y: rowY, width: barWidth, height: 11, color: item.color });
            });
        }

        page = document.addPage([595, 842]);
        drawHeader(false);
        centered('Estudo comparativo de contratos', bold, 18.5, 297.5, 716, navy, 500);
        centered(result.clientName + ' - ' + result.createdAt.toLocaleDateString('pt-BR'), regular, 9.2, 297.5, 696, muted, 500);

        var positiveSaving = result.monthlySaving >= 0;
        drawMetricCard(43, 627, positiveSaving ? 'REDUÇÃO MENSAL' : 'AUMENTO MENSAL', money(Math.abs(result.monthlySaving)), false);
        drawMetricCard(306, 627, positiveSaving ? 'REDUÇÃO EM 12 MESES' : 'AUMENTO EM 12 MESES', money(Math.abs(result.annualSaving)), true);
        drawMetricCard(43, 568, positiveSaving ? 'REDUÇÃO DA PARCELA' : 'VARIAÇÃO DA PARCELA', percent(Math.abs(result.installmentReduction)), false);
        drawMetricCard(306, 568, 'TAXA DO NOVO CONTRATO', percent(result.proposed.annualRate, 4) + ' a.a.', false);

        var tableX = 43;
        var widths = [169, 126, 126, 88];
        var headers = ['INDICADOR', 'SITUAÇÃO ATUAL', 'NOVO CONTRATO', 'DIFERENÇA'];
        var x = tableX;
        headers.forEach(function (header, index) {
            page.drawRectangle({ x: x, y: 527, width: widths[index], height: 28, color: navy });
            centered(header, bold, 7.3, x + widths[index] / 2, 537, index === 2 ? gold : white, widths[index] - 8);
            x += widths[index];
        });

        var rows = [
            ['Valor contratado', money(result.current.principal), money(result.proposed.principal), money(result.proposed.principal - result.current.principal)],
            ['Valor da parcela', money(result.current.payment), money(result.proposed.payment), money(result.proposed.payment - result.current.payment)],
            ['Taxa efetiva ao mês', percent(result.current.monthlyRate, 4), percent(result.proposed.monthlyRate, 4), percent(result.proposed.monthlyRate - result.current.monthlyRate, 4)],
            ['Taxa efetiva ao ano', percent(result.current.annualRate, 4), percent(result.proposed.annualRate, 4), percent(result.proposed.annualRate - result.current.annualRate, 4)],
            ['Quantidade de parcelas', String(result.current.installments), String(result.proposed.installments), String(result.proposed.installments - result.current.installments)],
            ['Valor total a pagar', money(result.current.total), money(result.proposed.total), money(result.proposed.total - result.current.total)],
            ['Juros estimados', money(result.current.interest), money(result.proposed.interest), money(result.proposed.interest - result.current.interest)]
        ];
        var rowY = 496;
        rows.forEach(function (row, rowIndex) {
            x = tableX;
            page.drawRectangle({ x: x, y: rowY, width: 509, height: 30, color: rowIndex % 2 ? ivory : white, borderColor: rgb(.9, .91, .93), borderWidth: .3 });
            row.forEach(function (value, index) {
                var valueColor = index === 2 ? navy : (index === 3 ? muted : ink);
                var valueFont = index === 0 || index === 2 ? bold : regular;
                centered(value, valueFont, index === 0 ? 8.1 : 7.8, x + widths[index] / 2, rowY + 10.5, valueColor, widths[index] - 9);
                x += widths[index];
            });
            rowY -= 30;
        });

        var rateMovement = result.annualRateDifference >= 0
            ? 'redução de ' + percent(result.annualRateDifference, 4)
            : 'aumento de ' + percent(Math.abs(result.annualRateDifference), 4);
        var conclusion = positiveSaving
            ? 'Com a troca, a parcela diminui ' + money(result.monthlySaving) + ' por mês (' + percent(result.installmentReduction) + '), equivalente a ' + money(result.annualSaving) + ' em 12 meses. A nova taxa é ' + percent(result.proposed.annualRate, 4) + ' ao ano, uma ' + rateMovement + ' pontos percentuais em relação à situação atual.'
            : 'O novo contrato aumenta a parcela em ' + money(Math.abs(result.monthlySaving)) + ' por mês. Revise prazo, taxa, valor liberado e custo total antes de recomendar a troca.';
        page.drawRectangle({ x: 43, y: 190, width: 509, height: 84, color: pale, borderColor: gold, borderWidth: .8 });
        page.drawText('RESUMO DA TROCA', { x: 58, y: 250, size: 9.4, font: bold, color: navy });
        wrapText(conclusion, regular, 8.6, 479).slice(0, 4).forEach(function (lineText, index) {
            page.drawText(lineText, { x: 58, y: 230 - index * 12, size: 8.6, font: regular, color: ink });
        });

        var note = 'Estudo baseado nos valores informados. Não representa aprovação de crédito, proposta bancária ou garantia de economia. O custo efetivo pode incluir tarifas, seguros, IOF, indexadores e outras despesas. Confirme as condições oficiais antes da contratação.';
        wrapText(note, regular, 7.6, 509).slice(0, 4).forEach(function (lineText, index) {
            centered(lineText, regular, 7.6, 297.5, 151 - index * 11, muted, 509);
        });
        drawFooter(1, 2);

        page = document.addPage([595, 842]);
        drawHeader(true);
        centered('Comparação visual', bold, 18, 297.5, 737, navy, 500);
        centered('Situação atual x novo contrato', regular, 9.2, 297.5, 718, muted, 500);
        drawChartBlock(529, 'Parcela mensal', 'Quanto o cliente paga por mês em cada contrato.', result.current.payment, result.proposed.payment, money);
        drawChartBlock(346, 'Custo total estimado', 'Soma das parcelas ou total exato informado.', result.current.total, result.proposed.total, money);
        drawChartBlock(163, 'Taxa efetiva anual', 'Comparação das taxas anuais equivalentes.', result.current.annualRate, result.proposed.annualRate, function (value) { return percent(value, 4); });
        drawFooter(2, 2);
        return document.save();
    }

    global.PremiumContractComparisonPdf = { calculate: calculate, createPdfBytes: createPdfBytes };
}(typeof window !== 'undefined' ? window : globalThis));
