/*
 * Practical 6.2 — Read and write a file using open/read/write/close
 *
 * Compile:  gcc practical6_2.c -o practical6_2
 * Run:      ./practical6_2
 */

#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>

#define BUFSIZE 256

int main()
{
    int fd;
    char buf[BUFSIZE];
    int n;

    /* ---- Write to a file ---- */
    fd = open("testfile.txt", O_WRONLY | O_CREAT | O_TRUNC);
    if (fd == -1)
    {
        perror("open (write)");
        return 1;
    }

    char *msg = "Hello from practical 6!\nThis file was written using write() syscall.\n";
    int len = 0;
    while (msg[len] != '\0') len++;

    n = write(fd, msg, len);
    printf("Written %d bytes to testfile.txt\n", n);
    close(fd);

    /* ---- Read back from the file ---- */
    fd = open("testfile.txt", O_RDONLY);
    if (fd == -1)
    {
        perror("open (read)");
        return 1;
    }

    printf("\nContents of testfile.txt:\n");
    printf("-------------------------\n");
    n = read(fd, buf, BUFSIZE - 1);
    if (n > 0)
    {
        buf[n] = '\0';
        printf("%s", buf);
    }
    close(fd);

    return 0;
}
