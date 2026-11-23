from enum import Enum
from typing import List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="MedMetric IMC Clinical Engine",
    version="1.0.0",
    description="Microsserviço de avaliação antropométrica segundo critérios da OMS."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

class SexoBiologico(str, Enum):
    MASCULINO = "M"
    FEMININO = "F"

class ImcRequest(BaseModel):
    peso_kg: float = Field(..., gt=20, lt=400, description="Massa corporal em quilogramas")
    altura_cm: float = Field(..., gt=100, lt=250, description="Estatura em centímetros")
    idade: int = Field(..., ge=18, le=120, description="Idade em anos completos")
    sexo: SexoBiologico

class ImcResponse(BaseModel):
    imc: float
    indice_ponderal: float
    classificacao: str
    risco_comorbidade: str
    cor_indicador: str
    faixa_peso_saudavel: str
    peso_ideal_kg: float
    ajuste_sugerido: str
    recomendacoes: List[str]

def calcular_peso_ideal_devine(altura_cm: float, sexo: SexoBiologico) -> float:
    base = 50.0 if sexo == SexoBiologico.MASCULINO else 45.5
    return round(base + 0.91 * (altura_cm - 152.4), 1)

@app.post("/api/v1/imc/evaluate", response_model=ImcResponse)
def evaluate_imc(data: ImcRequest) -> ImcResponse:
    altura_m = data.altura_cm / 100.0
    imc = round(data.peso_kg / (altura_m ** 2), 2)
    indice_ponderal = round(data.peso_kg / (altura_m ** 3), 2)

    peso_min = round(18.5 * (altura_m ** 2), 1)
    peso_max = round(24.9 * (altura_m ** 2), 1)
    peso_ideal = calcular_peso_ideal_devine(data.altura_cm, data.sexo)

    if imc < 18.5:
        classificacao = "Baixo Peso"
        risco = "Aumentado (Desnutrição)"
        cor = "#0284c7"
        ajuste = f"+{round(peso_min - data.peso_kg, 1)} kg para atingir eutrofia"
        recomendacoes = [
            "Investigar balanço energético negativo e aporte proteico diário.",
            "Avaliar exames bioquímicos (albumina, ferritina, vitamina B12)."
        ]
    elif imc < 25.0:
        classificacao = "Eutrofia (Normal)"
        risco = "Baixo (Risco Padrão)"
        cor = "#059669"
        ajuste = "Dentro da faixa saudável"
        recomendacoes = [
            "Manter hábitos alimentares equilibrados e rotina de exercícios.",
            "Acompanhar percentual de gordura para diferenciar massa magra."
        ]
    elif imc < 30.0:
        classificacao = "Sobrepeso"
        risco = "Moderadamente Aumentado"
        cor = "#d97706"
        ajuste = f"-{round(data.peso_kg - peso_max, 1)} kg para atingir eutrofia"
        recomendacoes = [
            "Medir circunferência da cintura (risco se > 94cm M / > 80cm F).",
            "Adotar déficit calórico controlado e exercícios aeróbicos + resistidos."
        ]
    else:
        grau = "Grau I" if imc < 35 else ("Grau II" if imc < 40 else "Grau III")
        classificacao = f"Obesidade {grau}"
        risco = "Alto a Muito Alto"
        cor = "#dc2626"
        ajuste = f"-{round(data.peso_kg - peso_max, 1)} kg para atingir eutrofia"
        recomendacoes = [
            "Encaminhamento para equipe multidisciplinar de saúde.",
            "Rastreamento metabólico (perfil lipídico, glicemia, pressão arterial)."
        ]

    return ImcResponse(
        imc=imc,
        indice_ponderal=indice_ponderal,
        classificacao=classificacao,
        risco_comorbidade=risco,
        cor_indicador=cor,
        faixa_peso_saudavel=f"{peso_min} kg – {peso_max} kg",
        peso_ideal_kg=peso_ideal,
        ajuste_sugerido=ajuste,
        recomendacoes=recomendacoes
    )