/*
 * Practical 6.1 — Display file information using stat()
 *
 * Compile:  gcc practical6_1.c -o practical6_1
 * Run:      ./practical6_1 hello.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

int main(int argc, char *argv[])
{
    struct stat st;

    if (argc != 2)
    {
        printf("Usage: %s <filename>\n", argv[0]);
        return 1;
    }

    if (stat(argv[1], &st) == -1)
    {
        perror("stat");
        return 1;
    }

    printf("\nFile Information for: %s\n", argv[1]);
    printf("----------------------------------\n");
    printf("Inode Number    : %ld\n", st.st_ino);
    printf("File Size       : %ld bytes\n", st.st_size);
    printf("Hard Links      : %ld\n", st.st_nlink);
    printf("Owner UID       : %d\n", st.st_uid);
    printf("Owner GID       : %d\n", st.st_gid);
    printf("Block Size      : %ld\n", st.st_blksize);
    printf("Blocks Alloc    : %ld\n", st.st_blocks);

    printf("\nFile Type       : ");
    if (S_ISREG(st.st_mode))
        printf("Regular File\n");
    else if (S_ISDIR(st.st_mode))
        printf("Directory\n");
    else if (S_ISLNK(st.st_mode))
        printf("Symbolic Link\n");
    else
        printf("Other\n");

    printf("Permissions     : %o\n", st.st_mode & 0777);

    return 0;
}
