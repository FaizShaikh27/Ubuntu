#include <stdio.h>
#include <stdlib.h>
#include <dirent.h>
#include <sys/types.h>

int main(int argc, char *argv[])
{
    DIR *dir;
    struct dirent *entry;

    if (argc != 2)
    {
        printf("Usage: %s <directory_path>\n", argv[0]);
        return 1;
    }

    dir = opendir(argv[1]);

    if (dir == NULL)
    {
        perror("Unable to open directory");
        return 1;
    }

    printf("\nDirectory: %s\n\n", argv[1]);
    printf("%-15s %s\n", "Inode Number", "File Name");
    printf("-----------------------------------------\n");

    while ((entry = readdir(dir)) != NULL)
    {
        printf("%-15lu %s\n",
               (unsigned long)entry->d_ino,
               entry->d_name);
    }

    closedir(dir);

    return 0;
}