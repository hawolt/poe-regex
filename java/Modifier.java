import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;

public class Modifier {

    private final List<String> mods = new LinkedList<>();
    private final Set<String> groups = new HashSet<>();
    private final Set<String> tags = new HashSet<>();

    private String generationType;
    private String origin;

    public void addAffix(String affix) {
        mods.add(affix);
    }

    public void addGroup(String group) {
        groups.add(group);
    }

    public void addTag(String tag) {
        tags.add(tag);
    }

    public String getAffix() {
        return mods.isEmpty() ? null : String.join("\n", mods);
    }

    public String getGenerationType() {
        return generationType;
    }

    public Set<String> getGroups() {
        return groups;
    }

    public Set<String> getTags() {
        return tags;
    }

    public void setGenerationType(String generationType) {
        this.generationType = generationType;
    }

    public void setOrigin(String origin) {
        this.origin = origin;
    }

    @Override
    public String toString() {
        return "Modifier{" +
                "origin='" + origin + '\'' +
                ", generationType='" + generationType + '\'' +
                ", tags=" + tags +
                ", groups=" + groups +
                ", affix=" + getAffix() +
                '}';
    }
}