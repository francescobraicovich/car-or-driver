/* Convert the supplied legacy FBX 6.1 driver to baked triangle data.
 * Build with ufbx v0.20.0: cc -O2 -I<ufbx-dir> tools/read-stage-driver.c <ufbx-dir>/ufbx.c -lm -o <output>
 */
#include "ufbx.h"
#include <stdio.h>
#include <stdlib.h>

static void write_string(FILE *output, ufbx_string value) {
    fputc('"', output);
    for (size_t i = 0; i < value.length; i++) {
        unsigned char c = value.data[i];
        if (c == '"' || c == '\\') fputc('\\', output);
        if (c >= 32) fputc(c, output);
    }
    fputc('"', output);
}

int main(int argc, char **argv) {
    if (argc != 3) return 1;
    ufbx_load_opts options = {0};
    options.target_axes = ufbx_axes_right_handed_z_up;
    options.target_unit_meters = 1.0;
    options.generate_missing_normals = true;
    options.evaluate_skinning = true;
    ufbx_error error;
    ufbx_scene *scene = ufbx_load_file(argv[1], &options, &error);
    if (!scene) { fprintf(stderr, "%s\n", error.description.data); return 1; }
    FILE *output = fopen(argv[2], "w");
    if (!output) return 1;
    fputs("[", output);
    int first = 1;
    for (size_t n = 0; n < scene->nodes.count; n++) {
        ufbx_node *node = scene->nodes.data[n];
        ufbx_mesh *mesh = node->mesh;
        if (!mesh) continue;
        fprintf(stderr, "%s: %zu triangles\n", node->name.data, mesh->num_triangles);
        ufbx_matrix normal_matrix = ufbx_matrix_for_normals(&node->geometry_to_world);
        uint32_t *indices = malloc(mesh->max_face_triangles * 3 * sizeof(uint32_t));
        if (!first) fputs(",", output);
        first = 0;
        fputs("{\"name\":", output); write_string(output, node->name);
        fputs(",\"materials\":[", output);
        for (size_t m = 0; m < node->materials.count; m++) {
            if (m) fputs(",", output);
            write_string(output, node->materials.data[m]->name);
        }
        fputs("],\"faces\":[", output);
        int first_face = 1;
        for (size_t f = 0; f < mesh->faces.count; f++) {
            uint32_t count = ufbx_triangulate_face(indices, mesh->max_face_triangles * 3, mesh, mesh->faces.data[f]);
            for (uint32_t t = 0; t < count; t++) {
                if (!first_face) fputs(",", output);
                first_face = 0;
                uint32_t material = mesh->face_material.count ? mesh->face_material.data[f] : 0;
                fprintf(output, "[%u", material);
                for (size_t v = 0; v < 3; v++) {
                    uint32_t index = indices[t * 3 + v];
                    ufbx_vec3 position = ufbx_get_vertex_vec3(&mesh->skinned_position, index);
                    ufbx_vec3 normal = ufbx_get_vertex_vec3(&mesh->skinned_normal, index);
                    if (mesh->skinned_is_local) {
                        position = ufbx_transform_position(&node->geometry_to_world, position);
                        normal = ufbx_transform_direction(&normal_matrix, normal);
                    }
                    ufbx_vec2 uv = mesh->vertex_uv.exists ? ufbx_get_vertex_vec2(&mesh->vertex_uv, index) : (ufbx_vec2){0};
                    fprintf(output, ",%.7g,%.7g,%.7g,%.7g,%.7g,%.7g,%.7g,%.7g", position.x,position.y,position.z,normal.x,normal.y,normal.z,uv.x,uv.y);
                }
                fputs("]", output);
            }
        }
        fputs("]}", output);
        free(indices);
    }
    fputs("]", output);
    fclose(output);
    ufbx_free_scene(scene);
    return 0;
}
