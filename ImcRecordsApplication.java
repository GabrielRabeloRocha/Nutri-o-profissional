package com.medmetric.imc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

@SpringBootApplication
@RestController
@RequestMapping("/api/v1/records")
@CrossOrigin(origins = "*")
public class ImcRecordsApplication {

    private final List<ImcRecordDTO> database = new CopyOnWriteArrayList<>();

    public static void main(String[] args) {
        SpringApplication.run(ImcRecordsApplication.class, args);
    }

    public record ImcRecordRequest(
        String paciente,
        double peso,
        double alturaCm,
        double imc,
        String classificacao
    ) {}

    public record ImcRecordDTO(
        UUID id,
        String recordedAt,
        String paciente,
        double peso,
        double alturaCm,
        double imc,
        String classificacao
    ) {}

    public record EvolutionSummaryDTO(
        String paciente,
        int totalAvaliacoes,
        double imcInicial,
        double imcAtual,
        double variacaoTotalImc,
        List<ImcRecordDTO> serieTemporal
    ) {}

    @PostMapping
    public ResponseEntity<?> saveRecord(@RequestBody ImcRecordRequest req) {
        if (req.paciente() == null || req.paciente().isBlank() || req.peso() <= 0 || req.alturaCm() <= 0) {
            return ResponseEntity.badRequest().body(Map.of("error", "Dados antropométricos inválidos."));
        }

        ImcRecordDTO saved = new ImcRecordDTO(
            UUID.randomUUID(),
            Instant.now().toString(),
            req.paciente().trim(),
            req.peso(),
            req.alturaCm(),
            req.imc(),
            req.classificacao()
        );

        database.add(0, saved);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @GetMapping
    public ResponseEntity<List<ImcRecordDTO>> listRecords(
            @RequestParam(required = false) String paciente) {
        if (paciente == null || paciente.isBlank()) {
            return ResponseEntity.ok(database);
        }

        List<ImcRecordDTO> filtered = database.stream()
            .filter(r -> r.paciente().equalsIgnoreCase(paciente.trim()))
            .toList();
        return ResponseEntity.ok(filtered);
    }

    @GetMapping("/evolution")
    public ResponseEntity<?> getPatientEvolution(@RequestParam String paciente) {
        List<ImcRecordDTO> chronological = database.stream()
            .filter(r -> r.paciente().equalsIgnoreCase(paciente.trim()))
            .sorted(Comparator.comparing(ImcRecordDTO::recordedAt))
            .toList();

        if (chronological.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Nenhum histórico encontrado para o paciente."));
        }

        double inicial = chronological.get(0).imc();
        double atual = chronological.get(chronological.size() - 1).imc();
        double variacao = Math.round((atual - inicial) * 100.0) / 100.0;

        return ResponseEntity.ok(new EvolutionSummaryDTO(
            paciente.trim(),
            chronological.size(),
            inicial,
            atual,
            variacao,
            chronological
        ));
    }
}