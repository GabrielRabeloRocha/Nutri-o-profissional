const API_CONFIG = {
    PYTHON_ENGINE_URL: "http://localhost:8000/api/v1/imc/evaluate",
    JAVA_RECORDS_URL: "http://localhost:8080/api/v1/records",
    STORAGE_KEY: "medmetric_imc_history_v2"
};

class ImcClinicalApp {
    constructor() {
        this.form = document.getElementById("imc-form");
        this.errorBanner = document.getElementById("form-error");
        this.patientFilter = document.getElementById("patient-filter");
        this.history = JSON.parse(localStorage.getItem(API_CONFIG.STORAGE_KEY)) || [];
        this.chartInstance = null;

        this.bindEvents();
        this.refreshAllViews();
    }

    bindEvents() {
        this.form.addEventListener("submit", (e) => this.handleEvaluation(e));
        this.patientFilter.addEventListener("change", () => this.refreshAllViews());

        document.getElementById("btn-limpar").addEventListener("click", () => {
            this.history = [];
            localStorage.removeItem(API_CONFIG.STORAGE_KEY);
            this.refreshAllViews();
        });
    }

    validateInput({ paciente, peso, alturaCm, idade }) {
        if (!paciente || paciente.trim().length < 2) return "Informe o nome do paciente.";
        if (isNaN(peso) || peso < 20 || peso > 400) return "Massa corporal deve estar entre 20 kg e 400 kg.";
        if (isNaN(alturaCm) || alturaCm < 100 || alturaCm > 250) return "Estatura deve estar entre 100 cm e 250 cm.";
        if (isNaN(idade) || idade < 18 || idade > 120) return "Protocolo adulto: idade entre 18 e 120 anos.";
        return null;
    }

    async handleEvaluation(event) {
        event.preventDefault();
        this.errorBanner.classList.add("hidden");

        const payload = {
            paciente: document.getElementById("paciente-nome").value.trim(),
            peso: parseFloat(document.getElementById("peso").value),
            alturaCm: parseFloat(document.getElementById("altura").value),
            idade: parseInt(document.getElementById("idade").value, 10),
            sexo: document.getElementById("sexo").value
        };

        const validationError = this.validateInput(payload);
        if (validationError) {
            this.errorBanner.textContent = validationError;
            this.errorBanner.classList.remove("hidden");
            return;
        }

        const diagnostic = await this.fetchOrComputeDiagnostic(payload);
        this.renderDiagnostic(diagnostic);
        await this.persistRecord(payload, diagnostic);
    }

    async fetchOrComputeDiagnostic(payload) {
        try {
            const response = await fetch(API_CONFIG.PYTHON_ENGINE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    peso_kg: payload.peso,
                    altura_cm: payload.alturaCm,
                    idade: payload.idade,
                    sexo: payload.sexo
                })
            });
            if (response.ok) return await response.json();
        } catch {
            // Fallback local idêntico ao microsserviço Python
        }

        const alturaM = payload.alturaCm / 100;
        const imc = +(payload.peso / (alturaM ** 2)).toFixed(2);
        const pesoMin = +(18.5 * (alturaM ** 2)).toFixed(1);
        const pesoMax = +(24.9 * (alturaM ** 2)).toFixed(1);
        const pesoIdeal = payload.sexo === "M"
            ? +(50 + 0.91 * (payload.alturaCm - 152.4)).toFixed(1)
            : +(45.5 + 0.91 * (payload.alturaCm - 152.4)).toFixed(1);

        let classificacao, risco, cor, diferenca, recomendacoes;

        if (imc < 18.5) {
            classificacao = "Baixo Peso";
            risco = "Aumentado (Desnutrição)";
            cor = "#0284c7";
            diferenca = `+${(pesoMin - payload.peso).toFixed(1)} kg para eutrofia`;
            recomendacoes = [
                "Avaliar ingestão calórico-proteica e investigar possíveis carências nutricionais.",
                "Priorizar alimentos de alta densidade nutricional e treino resistido."
            ];
        } else if (imc < 25.0) {
            classificacao = "Eutrofia (Normal)";
            risco = "Baixo (Risco Padrão)";
            cor = "#059669";
            diferenca = "Dentro da faixa ideal";
            recomendacoes = [
                "Manter equilíbrio energético atual e prática regular de atividade física.",
                "Monitorar composição corporal semestralmente."
            ];
        } else if (imc < 30.0) {
            classificacao = "Sobrepeso";
            risco = "Moderadamente Aumentado";
            cor = "#d97706";
            diferenca = `-${(payload.peso - pesoMax).toFixed(1)} kg para eutrofia`;
            recomendacoes = [
                "Aferir circunferência abdominal para estratificar risco cardiovascular.",
                "Instituir déficit calórico moderado (300 a 500 kcal/dia) associado a exercícios."
            ];
        } else {
            classificacao = imc < 35 ? "Obesidade Grau I" : imc < 40 ? "Obesidade Grau II" : "Obesidade Grau III";
            risco = "Alto a Muito Alto";
            cor = "#dc2626";
            diferenca = `-${(payload.peso - pesoMax).toFixed(1)} kg para eutrofia`;
            recomendacoes = [
                "Acompanhamento multidisciplinar (nutricionista, médico e educador físico).",
                "Solicitar perfil lipídico, glicemia de jejum e hemoglobina glicada."
            ];
        }

        return {
            imc,
            classificacao,
            risco_comorbidade: risco,
            cor_indicador: cor,
            faixa_peso_saudavel: `${pesoMin} kg – ${pesoMax} kg`,
            peso_ideal_kg: pesoIdeal,
            ajuste_sugerido: diferenca,
            recomendacoes
        };
    }

    renderDiagnostic(data) {
        document.getElementById("empty-state").classList.add("hidden");
        document.getElementById("diagnostic-content").classList.remove("hidden");

        document.getElementById("res-imc").textContent = data.imc.toFixed(1);
        const pill = document.getElementById("status-pill");
        pill.textContent = data.classificacao;
        pill.style.backgroundColor = `${data.cor_indicador}20`;
        pill.style.color = data.cor_indicador;

        const clampedImc = Math.min(40, Math.max(15, data.imc));
        const percent = ((clampedImc - 15) / 25) * 100;
        document.getElementById("gauge-marker").style.left = `${percent}%`;

        document.getElementById("res-faixa").textContent = data.faixa_peso_saudavel;
        document.getElementById("res-ideal").textContent = `${data.peso_ideal_kg} kg`;
        document.getElementById("res-diferenca").textContent = data.ajuste_sugerido;
        document.getElementById("res-risco").textContent = data.risco_comorbidade;

        document.getElementById("res-recomendacoes").innerHTML = data.recomendacoes
            .map(item => `<li>${item}</li>`)
            .join("");
    }

    async persistRecord(payload, diagnostic) {
        const now = new Date();
        const record = {
            isoDate: now.toISOString(),
            timestamp: now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
            paciente: payload.paciente,
            peso: payload.peso,
            alturaCm: payload.alturaCm,
            imc: diagnostic.imc,
            classificacao: diagnostic.classificacao
        };

        this.history.unshift(record);
        localStorage.setItem(API_CONFIG.STORAGE_KEY, JSON.stringify(this.history));

        this.updatePatientDropdown(record.paciente);
        this.refreshAllViews();

        try {
            await fetch(API_CONFIG.JAVA_RECORDS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(record)
            });
        } catch {
            // Sincronização assíncrona com servidor Java
        }
    }

    updatePatientDropdown(selectedPatient = null) {
        const currentSelection = selectedPatient || this.patientFilter.value;
        const uniquePatients = [...new Set(this.history.map(item => item.paciente))];

        this.patientFilter.innerHTML = `<option value="ALL">Todos os Pacientes</option>` +
            uniquePatients.map(name => `<option value="${name}">${name}</option>`).join("");

        if (uniquePatients.includes(currentSelection)) {
            this.patientFilter.value = currentSelection;
        }
    }

    getFilteredHistory() {
        const selected = this.patientFilter.value;
        if (selected === "ALL") return this.history;
        return this.history.filter(item => item.paciente === selected);
    }

    refreshAllViews() {
        this.updatePatientDropdown();
        const filtered = this.getFilteredHistory();
        this.renderChart(filtered);
        this.renderHistoryTable(filtered);
    }

    renderChart(records) {
        const emptyBox = document.getElementById("chart-empty");
        const wrapper = document.getElementById("chart-wrapper");

        if (records.length === 0) {
            emptyBox.classList.remove("hidden");
            wrapper.classList.add("hidden");
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }
            return;
        }

        emptyBox.classList.add("hidden");
        wrapper.classList.remove("hidden");

        // Ordena cronologicamente (do mais antigo para o mais recente) para o gráfico
        const chronological = [...records].reverse();
        const labels = chronological.map(r => `${r.timestamp} (${r.paciente.split(" ")[0]})`);
        const imcValues = chronological.map(r => r.imc);
        const pesoValues = chronological.map(r => r.peso);
        const limitMax = chronological.map(() => 24.9);
        const limitMin = chronological.map(() => 18.5);

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const ctx = document.getElementById("imc-evolution-chart").getContext("2d");
        this.chartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "IMC (kg/m²)",
                        data: imcValues,
                        borderColor: "#0284c7",
                        backgroundColor: "rgba(2, 132, 199, 0.12)",
                        borderWidth: 3,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        fill: true,
                        tension: 0.3,
                        yAxisID: "yImc"
                    },
                    {
                        label: "Peso (kg)",
                        data: pesoValues,
                        borderColor: "#64748b",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        borderDash: [4, 4],
                        pointRadius: 4,
                        tension: 0.3,
                        yAxisID: "yPeso"
                    },
                    {
                        label: "Limite Superior Normal (24.9)",
                        data: limitMax,
                        borderColor: "rgba(16, 185, 129, 0.55)",
                        borderWidth: 1.5,
                        borderDash: [6, 6],
                        pointRadius: 0,
                        fill: false,
                        yAxisID: "yImc"
                    },
                    {
                        label: "Limite Inferior Normal (18.5)",
                        data: limitMin,
                        borderColor: "rgba(56, 189, 248, 0.55)",
                        borderWidth: 1.5,
                        borderDash: [6, 6],
                        pointRadius: 0,
                        fill: false,
                        yAxisID: "yImc"
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { position: "top" },
                    tooltip: {
                        callbacks: {
                            afterBody: (items) => {
                                const idx = items[0].dataIndex;
                                return `Classificação: ${chronological[idx].classificacao}`;
                            }
                        }
                    }
                },
                scales: {
                    yImc: {
                        type: "linear",
                        position: "left",
                        title: { display: true, text: "IMC (kg/m²)" },
                        suggestedMin: 15,
                        suggestedMax: 35
                    },
                    yPeso: {
                        type: "linear",
                        position: "right",
                        title: { display: true, text: "Massa Corporal (kg)" },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    renderHistoryTable(records) {
        const tbody = document.getElementById("history-body");
        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;">Nenhum registro encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = records.map((item, idx) => {
            // Calcula variação em relação ao registro imediatamente anterior do mesmo paciente
            const previousSamePatient = records
                .slice(idx + 1)
                .find(r => r.paciente === item.paciente);

            let deltaHtml = `<span class="delta-badge delta-neutral">Inicial</span>`;
            if (previousSamePatient) {
                const diff = +(item.imc - previousSamePatient.imc).toFixed(2);
                if (diff > 0) {
                    deltaHtml = `<span class="delta-badge delta-up">+${diff.toFixed(2)}</span>`;
                } else if (diff < 0) {
                    deltaHtml = `<span class="delta-badge delta-down">${diff.toFixed(2)}</span>`;
                } else {
                    deltaHtml = `<span class="delta-badge delta-neutral">0.00</span>`;
                }
            }

            return `
                <tr>
                    <td>${item.timestamp}</td>
                    <td><strong>${item.paciente}</strong></td>
                    <td>${item.peso.toFixed(1)}</td>
                    <td>${item.alturaCm}</td>
                    <td><strong>${item.imc.toFixed(1)}</strong></td>
                    <td>${deltaHtml}</td>
                    <td>${item.classificacao}</td>
                </tr>
            `;
        }).join("");
    }
}

document.addEventListener("DOMContentLoaded", () => new ImcClinicalApp());