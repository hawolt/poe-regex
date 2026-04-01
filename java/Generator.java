import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;

public class Generator {

    private static final String MODS_URL = "https://repoe-fork.github.io/mods.min.json";
    private static final String OUTPUT_PATH = "map.mod.config.json";
    private static final String[] REQUIRED_TAGS = {"default", "low_tier_map", "mid_tier_map", "top_tier_map", "uber_tier_map", "implicit"};

    private static final Map<String, String> TRANSLATION = new HashMap<>() {{
        put("#% increased Pack size", "PACKSIZE");
        put("#% increased Quantity of Items found in this Area", "QUANTITY");
        put("#% increased Rarity of Items found in this Area", "RARITY");
        put("#% more Currency found in Area", "CURRENCY");
        put("#% more Maps found in Area", "MAPS");
        put("#% more Scarabs found in Area", "SCARABS");
        put("Found Items have #% chance to drop Corrupted in Area", "VAAL");
    }};

    public static void main(String[] args) throws IOException {
        JSONObject mods = new JSONObject(fetch(MODS_URL));
        Map<String, List<Modifier>> maps = new HashMap<>();

        for (String key : mods.keySet()) {
            JSONObject entry = mods.getJSONObject(key);
            if (!"area".equals(entry.getString("domain"))) continue;

            String generationType = entry.getString("generation_type");
            boolean accepted = Set.of("prefix", "suffix", "corrupted", "unique").contains(generationType);
            if (!accepted) continue;

            JSONArray weights = entry.getJSONArray("spawn_weights");
            if (weights.isEmpty() && "unique".equals(generationType)) {
                processImplicit(maps, entry, generationType);
            } else {
                for (int i = 0; i < weights.length(); i++) {
                    processWeight(maps, entry, generationType, weights.getJSONObject(i));
                }
            }
        }

        Files.write(Paths.get(OUTPUT_PATH), buildOutput(maps).toString(2).getBytes());
    }

    private static void processImplicit(Map<String, List<Modifier>> maps, JSONObject entry, String generationType) {
        if (!entry.has("text")) return;
        JSONArray tags = entry.getJSONArray("adds_tags");
        if (tags.isEmpty()) return;

        Modifier modifier = new Modifier();
        modifier.setGenerationType(generationType);
        modifier.setOrigin("implicit");
        for (String affix : entry.getString("text").replaceAll("\\d+", "#").split("\n")) {
            modifier.addAffix(affix);
        }
        maps.computeIfAbsent("implicit", k -> new ArrayList<>()).add(modifier);
    }

    private static void processWeight(Map<String, List<Modifier>> maps, JSONObject entry, String generationType, JSONObject w) {
        if (w.getInt("weight") == 0) return;
        if (!entry.has("text")) return;

        String tag = w.getString("tag");
        Modifier modifier = new Modifier();
        modifier.setGenerationType(generationType);
        modifier.setOrigin(tag);

        JSONArray groups = entry.getJSONArray("groups");
        for (int j = 0; j < groups.length(); j++) {
            modifier.addGroup(groups.getString(j));
        }

        for (String line : entry.getString("text").replaceAll("\\d+", "#").split("\n")) {
            if (TRANSLATION.containsKey(line)) {
                modifier.addTag(TRANSLATION.get(line));
            } else {
                modifier.addAffix(line);
            }
        }
        maps.computeIfAbsent(tag, k -> new ArrayList<>()).add(modifier);
    }

    private static JSONObject buildOutput(Map<String, List<Modifier>> maps) {
        JSONObject output = new JSONObject();
        for (String tag : REQUIRED_TAGS) {
            JSONArray array = new JSONArray();
            for (Modifier modifier : maps.getOrDefault(tag, Collections.emptyList())) {
                JSONObject mod = new JSONObject();
                mod.put("generation_type", modifier.getGenerationType());
                mod.put("groups", new JSONArray(modifier.getGroups()));
                mod.put("tags", new JSONArray(modifier.getTags()));
                mod.put("text", modifier.getAffix());
                array.put(mod);
            }
            output.put(tag, array);
        }
        return output;
    }

    private static String fetch(String endpoint) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("GET");
        return new String(connection.getInputStream().readAllBytes());
    }
}