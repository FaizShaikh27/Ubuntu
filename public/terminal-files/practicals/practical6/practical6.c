#include <stdio.h>
#include <sys/stat.h>
#include <time.h>

int main(int argc, char *argv[])
{
    struct stat fileStat;
    int i;

    if (argc < 2)
    {
        printf("Usage: %s <file1> <file2> ...\n", argv[0]);
        return 1;
    }

    for (i = 1; i < argc; i++)
    {
        if (stat(argv[i], &fileStat) == -1)
        {
            printf("Cannot access %s\n\n", argv[i]);
            continue;
        }

        printf("File Name : %s\n", argv[i]);

        /* File Type */
        if (S_ISREG(fileStat.st_mode))
            printf("File Type : Regular File\n");
        else if (S_ISDIR(fileStat.st_mode))
            printf("File Type : Directory\n");
        else if (S_ISLNK(fileStat.st_mode))
            printf("File Type : Symbolic Link\n");
        else
            printf("File Type : Other\n");

        /* Number of Links */
        printf("Number of Links : %ld\n", fileStat.st_nlink);

        /* Last Access Time */
        printf("Last Access Time : %s", ctime(&fileStat.st_atime));

        /* Permissions */
        printf("Permissions : ");

        printf((fileStat.st_mode & S_IRUSR) ? "r" : "-");
        printf((fileStat.st_mode & S_IWUSR) ? "w" : "-");
        printf((fileStat.st_mode & S_IXUSR) ? "x" : "-");

        printf((fileStat.st_mode & S_IRGRP) ? "r" : "-");
        printf((fileStat.st_mode & S_IWGRP) ? "w" : "-");
        printf((fileStat.st_mode & S_IXGRP) ? "x" : "-");

        printf((fileStat.st_mode & S_IROTH) ? "r" : "-");
        printf((fileStat.st_mode & S_IWOTH) ? "w" : "-");
        printf((fileStat.st_mode & S_IXOTH) ? "x" : "-");

        printf("\n\n");
    }

    return 0;
}